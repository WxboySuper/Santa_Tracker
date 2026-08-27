import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'node:url';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export type MigrationOptions = {
  url: string;
  migrationsFolder?: string;
};

/** Apply committed migrations and close the database connection. */
export async function migrateDatabase({ url, migrationsFolder: folder = migrationsFolder }: MigrationOptions): Promise<void> {
  const client = postgres(url, { max: 1 });

  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end();
  }
}
