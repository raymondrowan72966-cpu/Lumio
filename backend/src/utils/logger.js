/**
 * Structured logging — every entry is one JSON line to stdout (Workers ship
 * console output to `wrangler tail`/the Cloudflare dashboard automatically,
 * so a JSON line is all that's needed for it to be filterable/queryable
 * there; no external logging service integration is wired up yet).
 *
 * Deliberately five levels, matching the sprint's requirement exactly:
 * DEBUG < INFO < WARNING < ERROR, plus a separate AUDIT level that is never
 * filtered by `minLevel` (an audit entry — e.g. "workspace deleted" — must
 * never be silently dropped just because the environment's log level is
 * turned down).
 */

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

function levelIndex(level) {
  const idx = LEVELS.indexOf(level);
  return idx === -1 ? LEVELS.indexOf('INFO') : idx;
}

export function createLogger({ minLevel = 'INFO', context = {} } = {}) {
  const minIdx = levelIndex(minLevel);

  function write(level, message, meta) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...(meta || {}),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }

  return {
    debug(message, meta) {
      if (levelIndex('DEBUG') >= minIdx) write('DEBUG', message, meta);
    },
    info(message, meta) {
      if (levelIndex('INFO') >= minIdx) write('INFO', message, meta);
    },
    warning(message, meta) {
      if (levelIndex('WARNING') >= minIdx) write('WARNING', message, meta);
    },
    error(message, meta) {
      if (levelIndex('ERROR') >= minIdx) write('ERROR', message, meta);
    },
    /** Never filtered by minLevel — audit entries are always written. */
    audit(message, meta) {
      write('AUDIT', message, meta);
    },
    /** Returns a child logger that merges additional fields into every entry
     *  (e.g. a per-request logger carrying a requestId). */
    child(extraContext) {
      return createLogger({ minLevel, context: { ...context, ...extraContext } });
    },
  };
}
