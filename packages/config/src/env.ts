import { z } from 'zod';

/**
 * Validates environment once at process start.
 * Do NOT import this in client bundles — use the safe projection instead.
 */

const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1).default('postgresql://santa:santa@localhost:5432/santa_tracker'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me-32chars'),
  ADMIN_PASSKEY_RP_ID: z.string().default('localhost'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${message}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetServerEnvCache(): void {
  cached = null;
}

export type PublicEnv = {
  appUrl: string | null;
  isProduction: boolean;
};

export function getPublicEnv(serverEnv: ServerEnv): PublicEnv {
  return {
    appUrl: serverEnv.NEXT_PUBLIC_APP_URL ?? null,
    isProduction: serverEnv.NODE_ENV === 'production',
  };
}
