/**
 * Jest mock for Vite `?worker` imports. In tests, the synchronous derivation
 * fallback is used because jsdom does not implement a real Worker runtime, so
 * the worker constructor is never invoked. Returning a function that throws
 * guards against accidental worker usage in unit tests.
 */
module.exports = function WorkerMock() {
  throw new Error('Web Worker constructor should not be used in unit tests.');
};
