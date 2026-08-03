const BUILD_TARGET_LIST = ['local', 'beta', 'staging', 'production'];

/** Reports server registry keys that are absent from the client registry. */
export function validateServerFeaturesExistOnClient(registry, serverRegistry, errors) {
  const clientKeys = new Set(Object.keys(registry));
  for (const featureKey of Object.keys(serverRegistry)) {
    if (clientKeys.has(featureKey)) continue;
    errors.push(`Server registry feature "${featureKey}" is missing from client FEATURE_EXPOSURE_REGISTRY.`);
  }
}

/** Reports client server-backed features missing from the server registry. */
export function validateServerBackedFeaturesExistOnServer(registry, serverRegistry, errors) {
  const serverKeys = new Set(Object.keys(serverRegistry));
  for (const [featureKey, definition] of Object.entries(registry)) {
    if (!definition.serverBacked) continue;
    if (serverKeys.has(featureKey)) continue;
    errors.push(`Client server-backed feature "${featureKey}" is missing from SERVER_FEATURE_EXPOSURE_REGISTRY.`);
  }
}

/** Reports orphan server capability keys with no matching client owner. */
export function validateServerCapabilitiesHaveClientOwners(registry, serverRegistry, errors) {
  const clientCapabilityKeys = new Set(
    Object.values(registry)
      .filter((definition) => definition.serverBacked && definition.serverCapabilityKey)
      .map((definition) => definition.serverCapabilityKey)
  );

  for (const [featureKey, definition] of Object.entries(serverRegistry)) {
    if (!definition.serverCapabilityKey) continue;
    if (clientCapabilityKeys.has(definition.serverCapabilityKey)) continue;
    errors.push(
      `Server capability key "${definition.serverCapabilityKey}" (feature "${featureKey}") has no matching client serverBacked feature.`
    );
  }
}

/** Aligns client and server registry keys and capability ownership. */
export function validateClientServerRegistryAlignment(registry, serverRegistry, errors) {
  validateServerFeaturesExistOnClient(registry, serverRegistry, errors);
  validateServerBackedFeaturesExistOnServer(registry, serverRegistry, errors);
  validateServerCapabilitiesHaveClientOwners(registry, serverRegistry, errors);
}

/** Reports one mismatched exposure target between client and server registries. */
function validateExposureTargetAlignment({ featureKey, clientDefinition, serverDefinition, target }, errors) {
  const clientValue = clientDefinition.exposure?.[target];
  const serverValue = serverDefinition.exposure?.[target];
  if (clientValue === serverValue) return;
  errors.push(
    `Feature "${featureKey}" exposure.${target} is ${clientValue} on client but ${serverValue} on server registry.`
  );
}

/** Reports mismatched server capability keys between client and server registries. */
function validateServerCapabilityKeyAlignment({ featureKey, clientDefinition, serverDefinition }, errors) {
  if (clientDefinition.serverCapabilityKey === serverDefinition.serverCapabilityKey) return;
  errors.push(
    `Feature "${featureKey}" serverCapabilityKey is "${clientDefinition.serverCapabilityKey}" on client but "${serverDefinition.serverCapabilityKey}" on server.`
  );
}

/** Ensures client and server exposure matrices and capability keys stay aligned. */
export function validateClientServerExposureMatrices(registry, serverRegistry, errors) {
  for (const [featureKey, serverDefinition] of Object.entries(serverRegistry)) {
    const clientDefinition = registry[featureKey];
    if (!clientDefinition) continue;

    const alignmentContext = { featureKey, clientDefinition, serverDefinition };
    for (const target of BUILD_TARGET_LIST) {
      validateExposureTargetAlignment({ ...alignmentContext, target }, errors);
    }
    validateServerCapabilityKeyAlignment(alignmentContext, errors);
  }
}
