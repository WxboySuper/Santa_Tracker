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

/** Extracts the registry-matrix table from the release document. */
function parseMatrixTable(markdown) {
  const headingStart = markdown.indexOf('## Registry matrix');
  if (headingStart === -1) throw new Error('Could not find the "## Registry matrix" section.');

  const sectionAfterHeading = markdown.slice(headingStart + '## Registry matrix'.length);
  const nextHeading = sectionAfterHeading.search(/\n## /);
  const section = nextHeading === -1 ? sectionAfterHeading : sectionAfterHeading.slice(0, nextHeading);
  const lines = section.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const cells = splitTableRow(line);
    return cells?.[0] === EXPECTED_HEADER[0];
  });

  if (headerIndex === -1) throw new Error('Could not find the registry-matrix table header.');

  const header = splitTableRow(lines[headerIndex]);
  if (header?.length !== EXPECTED_HEADER.length || header.some((cell, index) => cell !== EXPECTED_HEADER[index])) {
    throw new Error(`Registry-matrix header must be ${EXPECTED_HEADER.join(' | ')}.`);
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitTableRow(line);
    if (!cells) {
      if (rows.length > 0) break;
      continue;
    }
    if (isSeparatorRow(cells)) continue;
    if (cells.length !== EXPECTED_HEADER.length) {
      throw new Error(`Registry-matrix row must contain ${EXPECTED_HEADER.length} cells: ${line}`);
    }
    rows.push(cells);
  }

  if (rows.length === 0) throw new Error('Registry-matrix table has no data rows.');
  return rows;
}

/** Extracts backtick-delimited registry keys from the first matrix cell. */
function extractRowKeys(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/**
 * Checks the human-facing matrix against the parsed executable registry.
 * @param {string} markdown
 * @param {Record<string, { exposure?: Record<string, boolean> }>} registry
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateExposureMatrixDocument(markdown, registry) {
  const errors = [];
  let rows;

  try {
    rows = parseMatrixTable(markdown);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const documentedKeys = [];
  rows.forEach((cells, rowIndex) => {
    const keys = extractRowKeys(cells[0]);
    if (keys.length === 0) {
      errors.push(`Registry-matrix row ${rowIndex + 1} does not declare any registry keys.`);
      return;
    }

    for (const key of keys) {
      documentedKeys.push(key);
      if (!registry[key]) {
        errors.push(`Registry-matrix row ${rowIndex + 1} documents unknown registry key "${key}".`);
        continue;
      }

      TARGETS.forEach((target, targetIndex) => {
        const documentedValue = cells[targetIndex + 2];
        const expectedValue = registry[key].exposure?.[target] ? 'On' : 'Off';
        if (documentedValue !== expectedValue) {
          errors.push(
            `Registry-matrix key "${key}" disagrees for ${target}: document says ${documentedValue}, registry says ${expectedValue}.`
          );
        }
      });
    }
  });

  const duplicateKeys = documentedKeys.filter((key, index) => documentedKeys.indexOf(key) !== index);
  for (const key of [...new Set(duplicateKeys)]) {
    errors.push(`Registry-matrix documents registry key "${key}" more than once.`);
  }

  const documentedKeySet = new Set(documentedKeys);
  for (const key of Object.keys(registry)) {
    if (!documentedKeySet.has(key)) errors.push(`Registry key "${key}" is missing from the registry matrix.`);
  }

  return { ok: errors.length === 0, errors };
}
