/** Returns true when a feature is temporary and exposed on production. */
function isTemporaryProductionExposure(definition) {
  if (!definition.temporary) return false;
  return definition.exposure?.production === true;
}

/** Returns true when production enablement was explicitly approved. */
function hasProductionEnablementApproval(featureKey, acknowledgements) {
  return acknowledgements[featureKey]?.productionEnablementApproved === true;
}

/** Adds violations for temporary features exposed in production without approval. */
export function validateProductionSafety(registry, acknowledgements, errors) {
  for (const [featureKey, definition] of Object.entries(registry)) {
    if (!isTemporaryProductionExposure(definition)) continue;
    if (hasProductionEnablementApproval(featureKey, acknowledgements)) continue;

    errors.push(
      `Temporary feature "${featureKey}" is exposed on production without productionEnablementApproved.`
    );
  }
}
