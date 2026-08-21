import { describe, expect, it, beforeEach } from 'vitest';
import { getPublicEnv, getServerEnv, resetServerEnvCache } from './env';

describe('@santa-tracker/config', () => {
  beforeEach(() => resetServerEnvCache());

  it('parses defaults', () => {
    const env = getServerEnv({} as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toContain('postgresql://');
  });

  it('throws on invalid NODE_ENV', () => {
    expect(() => getServerEnv({ NODE_ENV: 'staging' } as unknown as NodeJS.ProcessEnv)).toThrow(/Invalid server environment/);
  });

  it('produces safe public projection', () => {
    const server = getServerEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://example.com' } as unknown as NodeJS.ProcessEnv);
    const pub = getPublicEnv(server);
    expect(pub.isProduction).toBe(true);
    expect(pub.appUrl).toBe('https://example.com');
  });

  it('caches the parsed env', () => {
    const a = getServerEnv({} as NodeJS.ProcessEnv);
    const b = getServerEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv);
    expect(a).toBe(b); // cached reference
  });
});

