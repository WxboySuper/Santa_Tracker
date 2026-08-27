import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationFolderCandidates = [
  new URL('../drizzle', import.meta.url),
  new URL('../../drizzle', import.meta.url),
];

function getDefaultMigrationsFolder(): string {
  const folder = migrationFolderCandidates
    .map((candidate) => fileURLToPath(candidate))
    .find((candidate) => existsSync(candidate));

  if (!folder) {
    throw new Error('Could not locate the committed Drizzle migrations folder');
  }

  return folder;
}

export type MigrationOptions = {
  url: string;
  migrationsFolder?: string;
};

/** Apply committed migrations and close the database connection. */
export async function migrateDatabase({ url, migrationsFolder: folder }: MigrationOptions): Promise<void> {
  if (!url.trim()) {
    throw new Error('A PostgreSQL connection URL is required to run migrations');
  }

  const client = postgres(url, { max: 1 });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: folder ?? getDefaultMigrationsFolder(),
    });
  } finally {
    await client.end();
  }
}
