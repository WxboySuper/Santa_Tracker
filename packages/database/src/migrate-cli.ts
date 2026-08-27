import { getServerEnv } from '@santa-tracker/config';
import { migrateDatabase } from './migrate';

await migrateDatabase({ url: getServerEnv().DATABASE_URL });
