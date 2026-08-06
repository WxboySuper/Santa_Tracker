describe('themeSlice', () => {
  const loadSlice = async () => {
    let themeModule: typeof import('./themeSlice') | null = null;
    await jest.isolateModulesAsync(async () => {
      themeModule = await import('./themeSlice');
    });
    if (!themeModule) {
      throw new Error('Expected theme slice module to load');
    }
    return themeModule;
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    jest.resetModules();
  });

  test('starts with a deterministic default state and applies no DOM side effects', async () => {
    const themeModule = await loadSlice();
    const reducer = themeModule.default;

    expect(reducer(undefined, { type: 'unknown' })).toEqual({ darkMode: false });
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });

  test('toggleDarkMode and setDarkMode are pure state transitions', async () => {
    const themeModule = await loadSlice();
    const reducer = themeModule.default;
    const { setDarkMode, toggleDarkMode } = themeModule;

    const toggled = reducer(undefined, toggleDarkMode());
    expect(toggled.darkMode).toBe(true);
    expect(localStorage.getItem('darkMode')).toBeNull();

    const light = reducer(toggled, setDarkMode(false));
    expect(light.darkMode).toBe(false);
    expect(localStorage.getItem('darkMode')).toBeNull();
  });
});
