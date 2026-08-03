import { parse } from '@babel/parser';

/** Returns a stable Babel node description for policy error messages. */
function nodeText(node) {
  return node?.extra?.raw ?? node?.type ?? 'unknown node';
}

/** Returns whether a Babel node only wraps another expression. */
function isExpressionWrapper(node) {
  return [
    'TSAsExpression',
    'TSSatisfiesExpression',
    'TSTypeAssertion',
    'TSNonNullExpression',
    'ParenthesizedExpression',
  ].includes(node.type);
}

/** Removes TypeScript assertion and parenthesis wrappers. */
function unwrapExpression(node) {
  let current = node;
  while (isExpressionWrapper(current)) current = current.expression;
  return current;
}

/** Adds declarations from one variable statement to the constant map. */
function collectVariableDeclarations(statement, constants) {
  for (const declaration of statement.declarations) {
    if (declaration.id.type === 'Identifier' && declaration.init) {
      constants.set(declaration.id.name, declaration.init);
    }
  }
}

/** Indexes top-level initialized variables by name. */
function collectConstants(program) {
  const constants = new Map();
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') continue;
    collectVariableDeclarations(declaration, constants);
  }
  return constants;
}

/** Parses source text without executing it. */
export function parseSource(source, fileName) {
  try {
    return parse(source, {
      sourceFilename: fileName,
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
    }).program;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${fileName}: ${message}`);
  }
}

/** Reads a non-computed object property name. */
function propertyName(node, computed) {
  if (computed) throw new Error(`Unsupported computed property: ${nodeText(node)}`);
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'NumericLiteral') return String(node.value);
  throw new Error(`Unsupported computed property: ${nodeText(node)}`);
}

/** Evaluates a reference to another top-level literal constant. */
function evaluateIdentifier(expression, constants, resolving) {
  const name = expression.name;
  const initializer = constants.get(name);
  if (!initializer) throw new Error(`Unsupported identifier ${name}`);
  if (resolving.has(name)) throw new Error(`Circular constant reference involving ${name}`);
  return evaluateLiteral(initializer, constants, new Set(resolving).add(name));
}

/** Evaluates a signed numeric literal. */
function evaluateSignedNumber(expression) {
  if (expression.argument.type !== 'NumericLiteral') {
    throw new Error(`Unsupported numeric operand: ${nodeText(expression)}`);
  }
  if (expression.operator === '-') return -expression.argument.value;
  if (expression.operator === '+') return expression.argument.value;
  throw new Error(`Unsupported numeric operator: ${nodeText(expression)}`);
}

/** Applies an object spread after verifying it resolved to an object. */
function applySpread(property, value, constants, resolving) {
  const spread = evaluateLiteral(property.argument, constants, resolving);
  if (!spread || typeof spread !== 'object') throw new Error(`Object spread must resolve to an object: ${nodeText(property)}`);
  if (Array.isArray(spread)) throw new Error(`Object spread must not resolve to an array: ${nodeText(property)}`);
  Object.assign(value, spread);
}

/** Applies one supported property to an evaluated object literal. */
function applyObjectProperty(property, value, constants, resolving) {
  if (property.type === 'SpreadElement') {
    applySpread(property, value, constants, resolving);
    return;
  }
  if (property.type === 'ObjectProperty') {
    const key = propertyName(property.key, property.computed);
    const expression = property.shorthand ? property.key : property.value;
    value[key] = evaluateLiteral(expression, constants, resolving);
    return;
  }
  throw new Error(`Unsupported object member: ${nodeText(property)}`);
}

/** Evaluates an object containing literal metadata only. */
function evaluateObject(expression, constants, resolving) {
  const value = {};
  for (const property of expression.properties) applyObjectProperty(property, value, constants, resolving);
  return value;
}

/** Evaluates one supported array without allowing executable spreads. */
function evaluateArray(expression, constants, resolving) {
  return expression.elements.map((element) => {
    if (!element || element.type === 'SpreadElement') {
      throw new Error(`Unsupported array element: ${nodeText(element)}`);
    }
    return evaluateLiteral(element, constants, resolving);
  });
}

const LITERAL_READERS = {
  StringLiteral: (expression) => expression.value,
  NumericLiteral: (expression) => expression.value,
  BooleanLiteral: (expression) => expression.value,
  NullLiteral: () => null,
  UnaryExpression: evaluateSignedNumber,
  ArrowFunctionExpression: () => undefined,
  FunctionExpression: () => undefined,
  Identifier: evaluateIdentifier,
  ArrayExpression: evaluateArray,
  ObjectExpression: evaluateObject,
};

function rejectUnsupportedLiteral(expression) {
  throw new Error(`Unsupported non-literal expression: ${nodeText(expression)}`);
}

/** Safely evaluates the limited literal syntax used by policy configuration. */
function evaluateLiteral(node, constants, resolving) {
  const expression = unwrapExpression(node);
  const reader = LITERAL_READERS[expression.type] ?? rejectUnsupportedLiteral;
  return reader(expression, constants, resolving);
}

/** Extracts and safely evaluates a named top-level constant. */
export function extractConst(source, fileName, name) {
  const program = parseSource(source, fileName);
  const constants = collectConstants(program);
  const initializer = constants.get(name);
  if (!initializer) throw new Error(`Could not find ${name} in ${fileName}`);
  return evaluateLiteral(initializer, constants, new Set());
}

/** Reads and validates a string field from an extracted object. */
function getObjectString(object, key, context, required = true) {
  const value = object[key];
  if (typeof value === 'string') return value;
  if (!required && value === undefined) return undefined;
  throw new Error(`${context} must declare a string ${key}`);
}

/** Extracts policy-relevant gated route fields. */
export function extractGatedRoutes(source) {
  const routes = extractConst(source, 'featureSurfaces.ts', 'GATED_ROUTE_DEFINITIONS');
  return routes.map((route, index) => ({
    feature: getObjectString(route, 'feature', `GATED_ROUTE_DEFINITIONS[${index}]`),
    path: getObjectString(route, 'path', `GATED_ROUTE_DEFINITIONS[${index}]`),
  }));
}

/** Extracts policy-relevant navigation fields. */
export function extractNavigationItems(source) {
  const items = extractConst(source, 'featureNavigation.ts', 'APP_NAVIGATION_ITEMS');
  return items.map((item, index) => ({
    id: getObjectString(item, 'id', `APP_NAVIGATION_ITEMS[${index}]`),
    to: getObjectString(item, 'to', `APP_NAVIGATION_ITEMS[${index}]`),
    label: getObjectString(item, 'label', `APP_NAVIGATION_ITEMS[${index}]`),
    feature: getObjectString(item, 'feature', `APP_NAVIGATION_ITEMS[${index}]`, false),
  }));
}

/** Extracts the server-backed feature registry. */
export function extractServerRegistry(source) {
  return extractConst(source, 'serverFeatureExposure.js', 'SERVER_FEATURE_EXPOSURE_REGISTRY');
}

/** Extracts declared server capability keys. */
export function extractServerCapabilityKeys(serverRegistry) {
  return Object.values(serverRegistry)
    .map((definition) => definition.serverCapabilityKey)
    .filter((key) => typeof key === 'string');
}

/** Extracts side-effect module declarations keyed by feature. */
export function extractSideEffectModules(source) {
  return extractConst(source, 'featureSurfaces.ts', 'FEATURE_SIDE_EFFECT_MODULES');
}

/** Returns true when a value is a plain object map rather than an array or primitive. */
export function isPlainObjectMap(value) {
  if (!value) return false;
  if (typeof value !== 'object') return false;
  return !Array.isArray(value);
}

/** Ensures acknowledgement JSON parsed to a plain object map. */
export function assertAcknowledgementsShape(acknowledgements) {
  if (isPlainObjectMap(acknowledgements)) return;
  throw new Error('featureExposure.acknowledgements.json must contain a top-level object.');
}
