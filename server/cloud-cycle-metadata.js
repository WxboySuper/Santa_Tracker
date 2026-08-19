'use strict';

const MAX_METADATA_BYTES = 16 * 1024;
const MAX_METADATA_TEXT_LENGTH = 256;
const MAX_METADATA_COUNT = 10000;
const isBoundedText = (value) => typeof value === 'string' && value.length <= MAX_METADATA_TEXT_LENGTH;
const isBoundedCount = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_METADATA_COUNT;
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value, required, optional = []) => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
};
const isNonEmptyText = (value) => typeof value === 'string' && value.length > 0;
const isValidWorkflowVersion = (value) => Number.isInteger(value) && value >= 1 && value <= 32;
const isValidWorkflowVersionEntry = (version) => isRecord(version)
  && hasExactKeys(version, ['version', 'status', 'createdAt'], ['derivedFrom'])
  && isValidWorkflowVersion(version.version)
  && ['in-progress', 'completed', 'skipped', 'omitted'].includes(version.status)
  && isNonEmptyText(version.createdAt)
  && (!('derivedFrom' in version) || isValidWorkflowVersion(version.derivedFrom));
const hasValidWorkflowIdentity = (value) => isNonEmptyText(value.id)
  && isNonEmptyText(value.workflowId)
  && isNonEmptyText(value.cycleDate)
  && ['in-progress', 'completed', 'completed-with-omissions'].includes(value.status);
const hasValidWorkflowVersions = (value) => Array.isArray(value.outlookVersions)
  && value.outlookVersions.length <= 32
  && value.outlookVersions.every(isValidWorkflowVersionEntry);
const isValidWorkflowMetadata = (value) => {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'workflowId', 'cycleDate', 'status', 'outlookVersions', 'createdAt', 'updatedAt'])) return false;
  return hasValidWorkflowIdentity(value)
    && hasValidWorkflowVersions(value)
    && isNonEmptyText(value.createdAt)
    && isNonEmptyText(value.updatedAt);
};
const metadataValidators = new Map([
  ...['id', 'userId', 'label', 'cycleDate', 'createdAt', 'updatedAt', 'payloadHash'].map((key) => [key, isBoundedText]),
  ...['forecastDays', 'totalOutlooks', 'totalFeatures'].map((key) => [key, isBoundedCount]),
  ['isReadOnly', (value) => typeof value === 'boolean'],
  ['workflowMetadata', isValidWorkflowMetadata],
]);

const isValidMetadataValue = (key, value) => metadataValidators.get(key)?.(value) ?? false;

const getMetadataBytes = (metadata) => {
  try { return Buffer.byteLength(JSON.stringify(metadata), 'utf8'); } catch { return Infinity; }
};

const hasValidMetadataEntry = ([key, value]) => isValidMetadataValue(key, value);
const isMetadataObject = isRecord;
const hasValidMetadataEntries = (metadata) => Object.entries(metadata).every(hasValidMetadataEntry);
const isWithinMetadataLimit = (metadata) => getMetadataBytes(metadata) <= MAX_METADATA_BYTES;

const normalizeMetadata = (metadata) => {
  if (!isMetadataObject(metadata)) return null;
  if (!hasValidMetadataEntries(metadata) || !isWithinMetadataLimit(metadata)) return null;
  return Object.fromEntries(Object.entries(metadata));
};

module.exports = { normalizeMetadata };
