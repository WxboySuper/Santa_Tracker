import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL_TEST;

describe('database migrations', () => {
  it.skipIf(!databaseUrl)('creates the schema in an empty test database and is repeatable', async () => {
    if (!databaseUrl) return;

    const client = postgres(databaseUrl, { max: 1 });
    try {
      await client.unsafe(
        'DROP SCHEMA IF EXISTS "drizzle" CASCADE; DROP TABLE IF EXISTS "audit_events", "locations", "publications" CASCADE',
      );
    } finally {
      await client.end();
    }

    await migrateDatabase({ url: databaseUrl });
    await migrateDatabase({ url: databaseUrl });

    const verify = postgres(databaseUrl, { max: 1 });
    try {
      const tables = await verify<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('audit_events', 'locations', 'publications')
        ORDER BY table_name
      `;

      expect(tables.map(({ table_name }) => table_name)).toEqual([
        'audit_events',
        'locations',
        'publications',
      ]);

      const columns = await verify<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('audit_events', 'locations', 'publications')
        ORDER BY table_name, ordinal_position
      `;

      expect(columns).toEqual([
        { table_name: 'audit_events', column_name: 'id' },
        { table_name: 'audit_events', column_name: 'action' },
        { table_name: 'audit_events', column_name: 'actor' },
        { table_name: 'audit_events', column_name: 'created_at' },
        { table_name: 'audit_events', column_name: 'metadata' },
        { table_name: 'locations', column_name: 'id' },
        { table_name: 'locations', column_name: 'name' },
        { table_name: 'locations', column_name: 'country' },
        { table_name: 'locations', column_name: 'data' },
        { table_name: 'locations', column_name: 'updated_at' },
        { table_name: 'publications', column_name: 'id' },
        { table_name: 'publications', column_name: 'season' },
        { table_name: 'publications', column_name: 'schema_version' },
        { table_name: 'publications', column_name: 'checksum' },
        { table_name: 'publications', column_name: 'created_at' },
        { table_name: 'publications', column_name: 'author' },
        { table_name: 'publications', column_name: 'snapshot' },
      ]);

      const migrationRows = await verify<{ count: string }[]>`
        SELECT count(*)::text AS count FROM "drizzle"."__drizzle_migrations"
      `;
      expect(migrationRows[0]?.count).toBe('1');
    } finally {
      await verify.end();
    }
  });

  it.skipIf(!databaseUrl)('rolls back a failed migration and keeps the prior schema usable', async () => {
    if (!databaseUrl) return;

    const client = postgres(databaseUrl, { max: 1 });
    try {
      await client.unsafe(
        'DROP SCHEMA IF EXISTS "drizzle" CASCADE; DROP TABLE IF EXISTS "migration_probe", "migration_probe_invalid" CASCADE',
      );
    } finally {
      await client.end();
    }

    const migrationsFolder = fileURLToPath(
      new URL('./__fixtures__/rollback-migrations', import.meta.url),
    );

    await expect(migrateDatabase({ url: databaseUrl, migrationsFolder })).rejects.toThrow();

    const verify = postgres(databaseUrl, { max: 1 });
    try {
      const tables = await verify<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'migration_probe%'
      `;
      expect(tables).toEqual([{ table_name: 'migration_probe' }]);

      const columns = await verify<{ column_name: string }[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'migration_probe'
      `;
      expect(columns).toEqual([{ column_name: 'id' }]);
    } finally {
      await verify.end();
    }
  });
});
