import { clearLocalTestAccount, createLocalTestUser, isLocalTestAccountEnabled, readLocalTestAccount } from './localTestAccount';

describe('local test account fixture', () => {
  beforeEach(() => {
    globalThis.__GFC_DEV_MODE__ = true;
  });

  afterEach(() => {
    globalThis.__GFC_DEV_MODE__ = false;
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
  });

  test('requires development mode and an exact local hostname', () => {
    expect(isLocalTestAccountEnabled('localhost', true)).toBe(true);
    expect(isLocalTestAccountEnabled('127.0.0.1', true)).toBe(true);
    expect(isLocalTestAccountEnabled('localhost', false)).toBe(false);
    expect(isLocalTestAccountEnabled('beta.weatherboysuper.com', true)).toBe(false);
    expect(isLocalTestAccountEnabled('localhost.evil.example', true)).toBe(false);
  });

  test('reads free and premium fixtures only from local URLs', () => {
    window.history.replaceState({}, '', '/?localTestAccount=free');
    expect(readLocalTestAccount()).toBe('free');

    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/?localTestAccount=premium');
    expect(readLocalTestAccount()).toBe('premium');

    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/?localTestAccount=unknown');
    expect(readLocalTestAccount()).toBeNull();
  });

  test('returns null instead of throwing when session storage is unavailable', () => {
    const originalSessionStorage = window.sessionStorage;
    const blockedSessionStorage = {
      clear: () => undefined,
      getItem: () => {
        throw new Error('session storage blocked');
      },
      key: () => null,
      length: 0,
      removeItem: () => {
        throw new Error('session storage blocked');
      },
      setItem: () => {
        throw new Error('session storage blocked');
      },
    };

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: blockedSessionStorage,
    });

    try {
      window.history.replaceState({}, '', '/?localTestAccount=premium');

      expect(readLocalTestAccount()).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: originalSessionStorage,
      });
    }
  });

  test('keeps the fixture active after local SPA navigation removes the query string', () => {
    window.history.replaceState({}, '', '/?localTestAccount=free');
    expect(readLocalTestAccount()).toBe('free');

    window.history.replaceState({}, '', '/account');
    expect(readLocalTestAccount()).toBe('free');
  });

  test('clears both persisted fixture state and the activation query', () => {
    window.history.replaceState({}, '', '/?localTestAccount=premium');
    expect(readLocalTestAccount()).toBe('premium');

    clearLocalTestAccount();

    expect(window.location.search).toBe('');
    expect(readLocalTestAccount()).toBeNull();
  });

  test('creates a stable disposable identity', () => {
    expect(createLocalTestUser('premium')).toMatchObject({
      uid: 'local-test-premium',
      email: 'premium@local.test',
      displayName: 'Local premium test account',
    });
  });
});
