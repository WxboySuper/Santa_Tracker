const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverDirectory = __dirname;
const securityHeaders = fs.readFileSync(path.join(serverDirectory, 'gfc-security-headers.conf'), 'utf8');

for (const filename of ['nginx.conf', 'nginx-staging.conf']) {
  test(`${filename} includes shared headers for server and assets`, () => {
    const config = fs.readFileSync(path.join(serverDirectory, filename), 'utf8');
    assert.equal(config.match(/include \/etc\/nginx\/snippets\/gfc-security-headers\.conf;/g)?.length, 2);
    assert.equal(securityHeaders.match(/^add_header /gm)?.length, 5);
    assert.match(securityHeaders, /default-src 'self'/);
    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "frame-src 'self'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "media-src 'self'",
    ]) {
      assert.match(securityHeaders, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(securityHeaders, /https:\/\/identitytoolkit\.googleapis\.com/);
    assert.match(securityHeaders, /https:\/\/tiles\.openfreemap\.org/);
    assert.match(securityHeaders, /https:\/\/opengeo\.ncep\.noaa\.gov/);
    assert.match(securityHeaders, /https:\/\/telemetry\.gfc\.weatherboysuper\.com/);
    assert.doesNotMatch(securityHeaders, /report-only/i);
  });
}
