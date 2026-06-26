/* ============================================================
   ASSET STORE
   Production-ready asset storage layer for Lumio.

   Architecture:
     File → AssetStore → IndexedDB → asset://reference-id → LumioState

   LumioState stores reference IDs only. Asset content (blobs) lives
   exclusively in IndexedDB so localStorage is never burdened by binary data.

   DB:    lumio-assets  (version 1)
   Store: assets
   Fields: id, blob, mimeType, fileName, size, hash, createdAt, lastUsedAt
   Indexes: by-hash (duplicate detection), by-lastUsed (GC ordering)

   ID format: "asset://" + first 16 hex chars of SHA-256 content hash.
   IDs are deterministic: same content → same ID → automatic deduplication.
   ============================================================ */

const AssetStore = (() => {

  /* ── constants ── */
  const DB_NAME    = 'lumio-assets';
  const DB_VERSION = 1;
  const STORE_NAME = 'assets';
  const ID_PREFIX  = 'asset://';
  const HASH_CHARS = 16; // hex chars from SHA-256 digest used in the ID

  /* ── Object URL cache (session-scoped) ── */
  const _urlCache = new Map(); // assetId → objectUrl

  /* ── IndexedDB handle ── */
  let _db = null;
  let _dbPromise = null;

  /* ── In-memory fallback (private browsing / IDB unavailable) ── */
  let _fallback = null; // Map<assetId, { blob, mimeType, fileName, size, hash, createdAt, lastUsedAt }>

  /* ============================================================
     INTERNAL: open / initialise IndexedDB
     ============================================================ */
  function _openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('by-hash',     'hash',       { unique: false });
            store.createIndex('by-lastUsed', 'lastUsedAt', { unique: false });
          }
        };

        req.onsuccess = (e) => {
          _db = e.target.result;
          _db.onversionchange = () => { _db.close(); _db = null; _dbPromise = null; };
          resolve(_db);
        };

        req.onerror = (e) => {
          console.warn('[AssetStore] IndexedDB unavailable, using memory fallback:', e.target.error);
          _fallback = _fallback || new Map();
          resolve(null); // null signals fallback mode
        };

        req.onblocked = () => {
          console.warn('[AssetStore] IndexedDB blocked — another tab may have an older version open.');
        };
      } catch (err) {
        console.warn('[AssetStore] IndexedDB not available, using memory fallback:', err);
        _fallback = _fallback || new Map();
        resolve(null);
      }
    });
    return _dbPromise;
  }

  /* ── IDB transaction helpers ── */
  function _tx(mode) {
    return _db.transaction([STORE_NAME], mode).objectStore(STORE_NAME);
  }

  function _idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror  = () => reject(req.error);
    });
  }

  function _idbPut(store, record) {
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function _idbDelete(store, key) {
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  }

  function _idbGetByIndex(store, indexName, value) {
    return new Promise((resolve, reject) => {
      const req = store.index(indexName).get(value);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror  = () => reject(req.error);
    });
  }

  function _idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror  = () => reject(req.error);
    });
  }

  /* ============================================================
     INTERNAL: compute SHA-256 hash → hex string
     ============================================================ */
  async function _sha256Hex(blob) {
    const buf    = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /* ============================================================
     INTERNAL: generate asset ID from full hash
     ============================================================ */
  function _idFromHash(fullHex) {
    return ID_PREFIX + fullHex.slice(0, HASH_CHARS);
  }

  /* ============================================================
     INTERNAL: revoke a single Object URL and remove from cache
     ============================================================ */
  function _revokeOne(assetId) {
    const url = _urlCache.get(assetId);
    if (url) {
      URL.revokeObjectURL(url);
      _urlCache.delete(assetId);
    }
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */

  /**
   * isAssetRef(value) → boolean
   * Returns true if value is an asset:// reference string.
   * Use to distinguish asset IDs from external URLs and legacy data URLs.
   */
  function isAssetRef(value) {
    return typeof value === 'string' && value.startsWith(ID_PREFIX);
  }

  /**
   * put(file) → Promise<assetId>
   *
   * Stores a File or Blob in the asset store.
   * - Computes SHA-256 of content.
   * - Returns existing assetId if identical content already stored (dedup).
   * - Stores new entry otherwise.
   * - Returns the asset:// ID.
   */
  async function put(file) {
    await _openDb();

    if (!(file instanceof Blob)) throw new Error('[AssetStore] put() requires a File or Blob');

    // Normalise to Blob — MUST pass contentType through explicitly: Blob.slice()
    // called with no arguments drops the MIME type (resulting blob.type === '').
    // That stored, typeless blob is exactly what URL.createObjectURL() later
    // wraps for every <img>/<video>/<audio> tag rendered from this asset, so a
    // dropped type meant every upload silently failed to render as an image —
    // the actual root cause behind "Media Picker shows no preview" reports.
    const blob     = file instanceof File ? file.slice(0, file.size, file.type) : file;
    const fullHash = await _sha256Hex(blob);
    const assetId  = _idFromHash(fullHash);

    /* ── fallback mode ── */
    if (_fallback) {
      if (_fallback.has(assetId)) {
        _fallback.get(assetId).lastUsedAt = Date.now();
        return assetId;
      }
      _fallback.set(assetId, {
        id: assetId,
        blob,
        mimeType:    file.type || 'application/octet-stream',
        fileName:    file.name || 'file',
        size:        blob.size,
        hash:        fullHash,
        createdAt:   Date.now(),
        lastUsedAt:  Date.now(),
      });
      return assetId;
    }

    /* ── IDB mode: check by-hash index for duplicate ── */
    const idb    = _tx('readwrite');
    const existing = await _idbGetByIndex(idb, 'by-hash', fullHash);
    if (existing) {
      // Same content already stored — update lastUsedAt and return its ID
      existing.lastUsedAt = Date.now();
      // Use a fresh transaction to avoid the same store being reused after it closed
      const idb2 = _tx('readwrite');
      await _idbPut(idb2, existing);
      return existing.id;
    }

    const record = {
      id:          assetId,
      blob,
      mimeType:    file.type || 'application/octet-stream',
      fileName:    file.name || 'file',
      size:        blob.size,
      hash:        fullHash,
      createdAt:   Date.now(),
      lastUsedAt:  Date.now(),
    };

    const idb3 = _tx('readwrite');
    await _idbPut(idb3, record);
    return assetId;
  }

  /**
   * get(assetId) → Promise<{ blob, mimeType, fileName, size } | null>
   *
   * Retrieves asset metadata + blob. Returns null if not found.
   * Updates lastUsedAt as a side effect.
   */
  async function get(assetId) {
    await _openDb();
    if (!isAssetRef(assetId)) return null;

    if (_fallback) {
      const entry = _fallback.get(assetId);
      if (!entry) return null;
      entry.lastUsedAt = Date.now();
      return { blob: entry.blob, mimeType: entry.mimeType, fileName: entry.fileName, size: entry.size };
    }

    const idb    = _tx('readwrite');
    const record = await _idbGet(idb, assetId);
    if (!record) return null;

    record.lastUsedAt = Date.now();
    const idb2 = _tx('readwrite');
    await _idbPut(idb2, record);

    return { blob: record.blob, mimeType: record.mimeType, fileName: record.fileName, size: record.size };
  }

  /**
   * resolveUrl(assetId) → Promise<string | null>
   *
   * Returns a usable URL for the asset:
   * - Returns cached Object URL if already resolved this session.
   * - Creates a new Object URL from the stored blob.
   * - Returns null if not found.
   *
   * Object URLs remain valid until revokeUrl() or page unload.
   */
  async function resolveUrl(assetId) {
    if (!isAssetRef(assetId)) return assetId || null; // pass through non-refs

    if (_urlCache.has(assetId)) return _urlCache.get(assetId);

    const asset = await get(assetId);
    if (!asset) return null;

    const url = URL.createObjectURL(asset.blob);
    _urlCache.set(assetId, url);
    return url;
  }

  /**
   * revokeUrl(assetId) → void
   *
   * Frees the Object URL for this asset from memory.
   * The asset remains in IndexedDB; it can be re-resolved later.
   */
  function revokeUrl(assetId) {
    _revokeOne(assetId);
  }

  /**
   * delete(assetId) → Promise<void>
   *
   * Removes asset from IndexedDB and revokes any cached Object URL.
   */
  async function deleteAsset(assetId) {
    await _openDb();
    if (!isAssetRef(assetId)) return;

    _revokeOne(assetId);

    if (_fallback) {
      _fallback.delete(assetId);
      return;
    }

    const idb = _tx('readwrite');
    await _idbDelete(idb, assetId);
  }

  /**
   * exportAll(ids) → Promise<Array<{ id, blob, mimeType, fileName, size }>>
   *
   * Retrieves a set of assets by ID for bundling into a .lumio export package.
   * IDs not found in the store are silently skipped.
   */
  async function exportAll(ids) {
    await _openDb();
    const results = [];

    for (const id of ids) {
      if (!isAssetRef(id)) continue;

      if (_fallback) {
        const entry = _fallback.get(id);
        if (entry) results.push({ id, blob: entry.blob, mimeType: entry.mimeType, fileName: entry.fileName, size: entry.size });
        continue;
      }

      const idb    = _tx('readonly');
      const record = await _idbGet(idb, id);
      if (record) results.push({ id, blob: record.blob, mimeType: record.mimeType, fileName: record.fileName, size: record.size });
    }

    return results;
  }

  /**
   * importAll(entries) → Promise<void>
   *
   * Writes a set of asset entries (from a .lumio import package) into the store.
   * entries: Array<{ id, blob, mimeType, fileName, size }>
   * Existing entries with the same ID are overwritten (import is authoritative).
   */
  async function importAll(entries) {
    await _openDb();

    for (const entry of entries) {
      if (!isAssetRef(entry.id) || !(entry.blob instanceof Blob)) continue;

      const fullHash = await _sha256Hex(entry.blob);

      if (_fallback) {
        _fallback.set(entry.id, {
          id:         entry.id,
          blob:       entry.blob,
          mimeType:   entry.mimeType || 'application/octet-stream',
          fileName:   entry.fileName || 'file',
          size:       entry.blob.size,
          hash:       fullHash,
          createdAt:  Date.now(),
          lastUsedAt: Date.now(),
        });
        continue;
      }

      const record = {
        id:         entry.id,
        blob:       entry.blob,
        mimeType:   entry.mimeType || 'application/octet-stream',
        fileName:   entry.fileName || 'file',
        size:       entry.blob.size,
        hash:       fullHash,
        createdAt:  Date.now(),
        lastUsedAt: Date.now(),
      };

      const idb = _tx('readwrite');
      await _idbPut(idb, record);
    }
  }

  /**
   * pruneOrphans(referencedIds) → Promise<number>
   *
   * Removes all assets from the store whose IDs are not in referencedIds.
   * Returns the number of entries deleted.
   * Call after lesson deletion or before export to clean up unused assets.
   */
  async function pruneOrphans(referencedIds) {
    await _openDb();
    const refSet = new Set(referencedIds.filter(isAssetRef));
    let deleted = 0;

    if (_fallback) {
      for (const id of [..._fallback.keys()]) {
        if (!refSet.has(id)) {
          _revokeOne(id);
          _fallback.delete(id);
          deleted++;
        }
      }
      return deleted;
    }

    const idb     = _tx('readonly');
    const records = await _idbGetAll(idb);

    for (const record of records) {
      if (!refSet.has(record.id)) {
        _revokeOne(record.id);
        const idb2 = _tx('readwrite');
        await _idbDelete(idb2, record.id);
        deleted++;
      }
    }

    return deleted;
  }

  /* ── Revoke all Object URLs on page unload ── */
  window.addEventListener('pagehide', () => {
    for (const url of _urlCache.values()) URL.revokeObjectURL(url);
    _urlCache.clear();
  });

  /**
   * resolveMediaSrc(src) → string
   *
   * Synchronous renderer helper. Returns a usable URL for src:
   *   - asset:// refs already in the URL cache → cached blob URL
   *   - asset:// refs not yet cached           → '' (empty; call preloadBlocks first)
   *   - anything else (data:, blob:, https:, relative paths) → src unchanged
   *
   * Safe to call with null/undefined — returns ''.
   */
  function resolveMediaSrc(src) {
    if (!isAssetRef(src)) return src || '';
    return _urlCache.get(src) || '';
  }

  /**
   * preloadBlocks(blocks, extraRefs?) → Promise<number>
   *
   * Scans lesson blocks for all asset:// references across every known media
   * field, resolves each to an Object URL, and populates the URL cache so
   * resolveMediaSrc() returns synchronously during the next render pass.
   * Accepts an optional array of additional raw asset IDs to also resolve
   * (e.g. course hero/thumbnail refs that live outside block arrays).
   * Returns the count of references newly resolved (0 when cache is warm).
   */
  async function preloadBlocks(blocks, extraRefs) {
    const refs = new Set();

    function collect(val) {
      if (isAssetRef(val)) refs.add(val);
    }

    for (const block of (blocks || [])) {
      const d  = block.data   || {};
      const ds = block.design || {};

      // Block-level fields
      collect(d.src);
      collect(d.imageUrl);
      collect(d.image);
      collect(d.background);
      collect(d.avatar);
      collect(ds.bgImage);
      collect(ds.iconImage);

      // Generic items (carousel, column_grid, accordion, tabs, process, flashcard)
      for (const it of (d.items || [])) {
        collect(it.src);
        collect(it.imageUrl);
        collect(it.image);
        collect(it.audio);
        collect(it.video);
        collect(it.file);
        // Flashcard faces
        const f = it.front || {}, b = it.back || {};
        collect(f.image); collect(f.audio); collect(f.video);
        collect(b.image); collect(b.audio); collect(b.video);
      }

      // Quote carousel
      for (const q of (d.quotes || [])) collect(q.avatar);

      // Scenario scenes
      for (const sc of (d.scenes || [])) {
        collect(sc.backgroundImage);
        collect(sc.backgroundVideo);
        collect(sc.backgroundAudio);
        collect(sc.characterImage);
      }

      // Labelled graphic hotspots
      for (const h of (d.hotspots || [])) {
        collect(h.image);
        collect(h.audio);
        collect(h.video);
        collect(h.file);
      }
    }

    // Caller-supplied extra refs (hero image, thumbnails, avatar, etc.)
    for (const ref of (extraRefs || [])) collect(ref);

    let count = 0;
    await Promise.all([...refs].map(async id => {
      if (!_urlCache.has(id)) {
        await resolveUrl(id);
        count++;
      }
    }));
    return count;
  }

  /* ── Expose internal for validation harness only ── */
  function _getState() {
    return { dbOpen: !!_db, fallbackMode: !!_fallback, cachedUrls: _urlCache.size };
  }

  /* ============================================================
     PUBLIC EXPORT
     ============================================================ */
  return {
    isAssetRef,
    put,
    get,
    resolveUrl,
    revokeUrl,
    delete: deleteAsset,
    exportAll,
    importAll,
    pruneOrphans,
    resolveMediaSrc,
    preloadBlocks,
    _getState, // validation only — not part of public contract
  };

})();
