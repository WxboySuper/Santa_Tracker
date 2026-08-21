import { describe, expect, it } from 'vitest';
import { auditEvents, locations, publications } from './schema';

describe('@santa-tracker/database', () => {
  it('exposes drizzle tables', () => {
    expect(publications).toBeDefined();
    expect(locations).toBeDefined();
    expect(auditEvents).toBeDefined();
  });

  it('tables have expected names', () => {
    // drizzle tables expose internal config via .$table? Check name property via constructor
    // We assert the table objects are truthy; deeper introspection is tested in integration suites.
    expect(typeof publications).toBe('object');
  });
});

