import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL_TEST;

describe('database migrations', () => {
  it.skipIf(!databaseUrl)('creates the schema in an empty test database and is repeatable', async () => {
    if (!databaseUrl) return;

    const client = postgres(databaseUrl, { max: 1 });
    try {
      await client.unsafe(
        'DROP TABLE IF EXISTS "audit_events", "locations", "publications", "__drizzle_migrations" CASCADE',
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
    } finally {
      await verify.end();
    }
  });
});
