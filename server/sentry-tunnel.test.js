'use strict';

const assert = require('node:assert/strict');
const { test, afterEach, mock } = require('node:test');
const { parseAllowedSentryEndpoint, parseSentryDsnString, buildEnvelopeUrl, getConfiguredSentryEndpoint, registerSentryTunnelRoutes } = require('./sentry-tunnel');
const validEnvelope = Buffer.from(`${JSON.stringify({ dsn: 'https://key@o123.ingest.us.sentry.io/456' })}\n{"type":"session"}`);
const originalFetch = global.fetch;

afterEach(() => { mock.timers.reset(); global.fetch = originalFetch; delete process.env.SENTRY_BROWSER_DSN; delete process.env.SENTRY_DSN; });
test('parses DSN and URL helpers', () => { const endpoint = parseAllowedSentryEndpoint(validEnvelope); assert.deepEqual(endpoint, { host: 'o123.ingest.us.sentry.io', projectId: '456' }); assert.equal(buildEnvelopeUrl(endpoint.host, endpoint.projectId), 'https://o123.ingest.us.sentry.io/api/456/envelope/'); assert.deepEqual(parseSentryDsnString('https://key@o123.ingest.us.sentry.io/456'), endpoint); });
test('rejects malformed DSNs and prefers the browser DSN', () => { assert.equal(parseAllowedSentryEndpoint(Buffer.from('not-json\n{}')), null); assert.equal(parseSentryDsnString('http://evil.example/1'), null); process.env.SENTRY_BROWSER_DSN = 'https://key@o111.ingest.us.sentry.io/111'; process.env.SENTRY_DSN = 'https://key@o222.ingest.us.sentry.io/222'; assert.deepEqual(getConfiguredSentryEndpoint(), { host: 'o111.ingest.us.sentry.io', projectId: '111' }); });

const setupRoute = () => { process.env.SENTRY_BROWSER_DSN = 'https://key@o123.ingest.us.sentry.io/456'; let handler; const app = { post: (...args) => { handler = args.at(-1); } }; registerSentryTunnelRoutes(app, { raw: () => () => undefined }, () => () => undefined); return handler; };
const createRequest = () => { const listeners = new Map(); return { body: validEnvelope, destroyed: false, once: (event, callback) => listeners.set(event, callback), removeListener: (event) => listeners.delete(event), emit: (event) => listeners.get(event)?.() }; };
const createResponse = () => ({ destroyed: false, headersSent: false, statusCode: null, status(code) { this.statusCode = code; return this; }, end() {}, once() {}, removeListener() {} });

test('returns 504 when upstream aborts at the timeout', async () => { mock.timers.enable({ apis: ['setTimeout'] }); const route = setupRoute(); const request = createRequest(); const response = createResponse(); global.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); const pending = route(request, response); mock.timers.tick(5000); await pending; assert.equal(response.statusCode, 504); });
test('passes through healthy upstream status and cleans up', async () => { const route = setupRoute(); const request = createRequest(); const response = createResponse(); global.fetch = async () => ({ status: 202 }); await route(request, response); assert.equal(response.statusCode, 202); });
test('returns 500 for non-timeout upstream failures', async () => { const route = setupRoute(); const request = createRequest(); const response = createResponse(); global.fetch = async () => { throw new Error('upstream down'); }; await route(request, response); assert.equal(response.statusCode, 500); });
test('aborts upstream and does not write after client disconnect', async () => { const route = setupRoute(); const request = createRequest(); const response = createResponse(); response.destroyed = true; let aborted = false; global.fetch = (_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => { aborted = true; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }); request.emit('close'); }); await route(request, response); assert.equal(aborted, true); assert.equal(response.statusCode, null); });
