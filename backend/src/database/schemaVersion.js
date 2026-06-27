/**
 * Read-only introspection of the schema version. Migrations themselves are
 * applied via Wrangler's built-in D1 migrations feature (see
 * backend/migrations/README.md) — this module does not run migrations, it
 * only reports what's already been applied, for the health-check route and
 * future deploy-time sanity checks.
 *
 * Wrangler creates and maintains the `d1_migrations` table itself the first
 * time `wrangler d1 migrations apply` runs; until then, this table simply
 * doesn't exist yet, which is the expected state for a brand-new database
 * and is reported as `{ applied: [], latest: null }`, not an error.
 */
export async function getSchemaVersion(db) {
  try {
    const rows = await db.all('SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC');
    return {
      applied: rows,
      latest: rows.length > 0 ? rows[rows.length - 1].name : null,
    };
  } catch (err) {
    // d1_migrations not existing yet is expected pre-first-migration, not a failure.
    return { applied: [], latest: null };
  }
}
