const TARGETS = ['local', 'beta', 'staging', 'production'];
const EXPECTED_HEADER = [
  'Registry key(s) / surface',
  'Tracker',
  'Local',
  'Beta',
  'Staging',
  'Production',
  'Gate or dependency',
];

/** Splits one Markdown table row without interpreting its cell contents. */
function splitTableRow(line) {
  if (!line.startsWith('|') || !line.endsWith('|')) return null;
  return line.slice(1, -1).split('|').map((cell) => cell.trim());
}

/** Returns true for a Markdown table separator row. */
function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/** Returns the lines belonging to the registry-matrix section. */
function getMatrixSectionLines(markdown) {
  const headingStart = markdown.indexOf('## Registry matrix');
  if (headingStart === -1) throw new Error('Could not find the "## Registry matrix" section.');

  const sectionAfterHeading = markdown.slice(headingStart + '## Registry matrix'.length);
  const nextHeading = sectionAfterHeading.search(/\n## /);
  const section = nextHeading === -1 ? sectionAfterHeading : sectionAfterHeading.slice(0, nextHeading);
  return section.split(/\r?\n/);
}

/** Finds the registry-matrix header row. */
function findMatrixHeader(lines) {
  const headerIndex = lines.findIndex((line) => splitTableRow(line)?.[0] === EXPECTED_HEADER[0]);

  if (headerIndex === -1) throw new Error('Could not find the registry-matrix table header.');

  const header = splitTableRow(lines[headerIndex]);
  const hasExpectedShape =
    header?.length === EXPECTED_HEADER.length && header.every((cell, index) => cell === EXPECTED_HEADER[index]);
  if (!hasExpectedShape) {
    throw new Error(`Registry-matrix header must be ${EXPECTED_HEADER.join(' | ')}.`);
  }

  return headerIndex;
}

/** Classifies a line after the registry-matrix header. */
function classifyMatrixLine(line, hasRows) {
  const cells = splitTableRow(line);
  if (!cells) return hasRows ? 'end' : 'skip';
  if (isSeparatorRow(cells)) return 'skip';
  if (cells.length !== EXPECTED_HEADER.length) {
    throw new Error(`Registry-matrix row must contain ${EXPECTED_HEADER.length} cells: ${line}`);
  }
  return cells;
}

/** Reads data rows after the registry-matrix header. */
function collectMatrixRows(lines, headerIndex) {
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const classifiedLine = classifyMatrixLine(line, rows.length > 0);
    if (classifiedLine === 'end') break;
    if (classifiedLine !== 'skip') rows.push(classifiedLine);
  }

  if (rows.length === 0) throw new Error('Registry-matrix table has no data rows.');
  return rows;
}

/** Extracts the registry-matrix table from the release document. */
function parseMatrixTable(markdown) {
  const lines = getMatrixSectionLines(markdown);
  const headerIndex = findMatrixHeader(lines);
  return collectMatrixRows(lines, headerIndex);
}

/** Extracts backtick-delimited registry keys from the first matrix cell. */
function extractRowKeys(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/** Returns validation errors for one known registry key's target cells. */
function validateTargetValues(cells, rowIndex, key, registryEntry) {
  return TARGETS.flatMap((target, targetIndex) => {
    const documentedValue = cells[targetIndex + 2];
    const expectedValue = registryEntry.exposure?.[target] ? 'On' : 'Off';
    if (documentedValue === expectedValue) return [];
    return [
      `Registry-matrix key "${key}" disagrees for ${target}: document says ${documentedValue}, registry says ${expectedValue}.`,
    ];
  });
}

/** Returns validation errors for one documented registry key. */
function validateDocumentedKey(cells, rowIndex, key, registry) {
  const registryEntry = registry[key];
  if (!registryEntry) {
    return [`Registry-matrix row ${rowIndex + 1} documents unknown registry key "${key}".`];
  }
  return validateTargetValues(cells, rowIndex, key, registryEntry);
}

/** Returns validation errors and keys for one matrix row. */
function validateMatrixRow(cells, rowIndex, registry) {
  const keys = extractRowKeys(cells[0]);
  if (keys.length === 0) {
    return {
      keys,
      errors: [`Registry-matrix row ${rowIndex + 1} does not declare any registry keys.`],
    };
  }

  return {
    keys,
    errors: keys.flatMap((key) => validateDocumentedKey(cells, rowIndex, key, registry)),
  };
}

/** Validates all matrix rows and collects their documented keys. */
function validateMatrixRows(rows, registry) {
  const rowResults = rows.map((cells, rowIndex) => validateMatrixRow(cells, rowIndex, registry));
  return {
    documentedKeys: rowResults.flatMap(({ keys }) => keys),
    errors: rowResults.flatMap(({ errors }) => errors),
  };
}

/** Returns duplicate-key errors for the matrix. */
function duplicateKeyErrors(documentedKeys) {
  const counts = new Map();
  for (const key of documentedKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => `Registry-matrix documents registry key "${key}" more than once.`);
}

/** Returns missing-key errors for the matrix. */
function missingKeyErrors(documentedKeys, registry) {
  const documentedKeySet = new Set(documentedKeys);
  return Object.keys(registry)
    .filter((key) => !documentedKeySet.has(key))
    .map((key) => `Registry key "${key}" is missing from the registry matrix.`);
}

/**
 * Checks the human-facing matrix against the parsed executable registry.
 * @param {string} markdown
 * @param {Record<string, { exposure?: Record<string, boolean> }>} registry
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateExposureMatrixDocument(markdown, registry) {
  let rows;

  try {
    rows = parseMatrixTable(markdown);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const rowResult = validateMatrixRows(rows, registry);
  const errors = [
    ...rowResult.errors,
    ...duplicateKeyErrors(rowResult.documentedKeys),
    ...missingKeyErrors(rowResult.documentedKeys, registry),
  ];

  return { ok: errors.length === 0, errors };
}
