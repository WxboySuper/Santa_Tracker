import { describe, expect, it } from 'vitest';
import { permissiveLicense } from './stop-card-license.mjs';

describe('photo license allow-list', () => {
  it.each([
    ['CC0', 'CC0'], ['CC0 1.0', 'CC0'], ['Public domain', 'Public domain'], ['PD-US', 'Public domain'],
    ['CC BY 2.0', 'CC BY'], ['CC BY 4.0', 'CC BY'], ['CC BY-SA 3.0', 'CC BY-SA'], ['CC BY-SA 4.0', 'CC BY-SA'], ['CC BY-SA 3.0 de', 'CC BY-SA'],
  ])('accepts %s', (name, expected) => expect(permissiveLicense(name)).toBe(expected));

  it.each(['CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 4.0', 'CC BY-NC-ND 3.0', 'GFDL', 'All rights reserved', '', undefined])(
    'rejects %s', (name) => expect(permissiveLicense(name)).toBeNull());
});
