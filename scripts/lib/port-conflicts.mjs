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

/** @deprecated Use classifyForwardPortConflicts. */
export const classifyBetaPortConflicts = classifyForwardPortConflicts;
/** @deprecated Use canAutoResolveAllForwardPortConflicts. */
export const canAutoResolveAllBetaPortConflicts = canAutoResolveAllForwardPortConflicts;
export const FORWARD_PORT_KEEP_TARGET_PATHS = [];
export const BETA_PORT_KEEP_TARGET_PATHS = FORWARD_PORT_KEEP_TARGET_PATHS;
export const isBetaPortKeepTargetPath = () => false;
