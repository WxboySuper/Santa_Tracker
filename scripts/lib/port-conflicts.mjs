/**
 * Main may be a rewrite of the stable line. Conflict resolution therefore
 * stays human-owned; silently choosing stable metadata could publish the wrong
 * next-major version or erase an intentional main change.
 */
export const classifyForwardPortConflicts = (conflictPaths) => ({
  autoResolvable: [],
  needsHuman: [...conflictPaths],
});

export const canAutoResolveAllForwardPortConflicts = () => false;

