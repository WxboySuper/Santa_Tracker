'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { __testing, wrapBillingJsonRoute } = require('./billing');

/** Creates the small Express response surface used by billing route failures. */
const createResponse = () => {
  const response = {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  return response;
};

describe('billing route error boundary', () => {
  it('returns a stable public error without leaking provider exception text', async () => {
    const providerMessage = 'Stripe request failed for secret customer details';
    const providerError = Object.assign(new Error(providerMessage), { code: 'provider_internal' });
    const handler = wrapBillingJsonRoute({
      handler: async () => {
        throw providerError;
      },
      fallbackMessage: 'Unable to create checkout session.',
      failureCode: 'billing_checkout_failed',
    });
    const response = createResponse();
    const errorLog = mock.method(console, 'error', () => {});

    try {
      await handler({ method: 'POST', path: '/api/billing/checkout' }, response);
    } finally {
      errorLog.mock.restore();
    }

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.error, 'Unable to create checkout session.');
    assert.equal(response.body.code, 'billing_checkout_failed');
    assert.match(response.body.requestId, /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers['X-Request-ID'], response.body.requestId);
    assert.equal(JSON.stringify(response.body).includes(providerMessage), false);
  });

  it('logs bounded diagnostics under the same request id', async () => {
    const providerError = Object.assign(new Error(`line one\n${'x'.repeat(700)}`), {
      code: 'provider_timeout',
    });
    const handler = wrapBillingJsonRoute({
      handler: async () => {
        throw providerError;
      },
      fallbackMessage: 'Unable to open the billing portal.',
      failureCode: 'billing_portal_failed',
    });
    const response = createResponse();
    const errorLog = mock.method(console, 'error', () => {});

    try {
      await handler({ method: 'POST', path: '/api/billing/portal' }, response);
      const [, diagnostic] = errorLog.mock.calls[0].arguments;
      assert.equal(diagnostic.requestId, response.body.requestId);
      assert.equal(diagnostic.failureCode, 'billing_portal_failed');
      assert.equal(diagnostic.path, '/api/billing/portal');
      assert.equal(diagnostic.errorMessage.includes('\n'), false);
      assert.equal(diagnostic.errorMessage.length, 500);
      assert.equal(diagnostic.providerCode, 'provider_timeout');
    } finally {
      errorLog.mock.restore();
    }
  });

  it('does not interfere with handlers that intentionally send a response', async () => {
    const response = createResponse();
    const handler = wrapBillingJsonRoute({
      handler: async (_req, res) => res.status(400).json({ error: 'Invalid billing plan selected.' }),
      fallbackMessage: 'Unable to create checkout session.',
      failureCode: 'billing_checkout_failed',
    });

    await handler({ method: 'POST', path: '/api/billing/checkout' }, response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Invalid billing plan selected.' });
    assert.deepEqual(response.headers, {});
  });

  it('does not expose webhook construction errors', async () => {
    const providerMessage = 'Stripe signature details should stay server-side';
    const response = createResponse();
    const errorLog = mock.method(console, 'error', () => {});
    const stripe = {
      webhooks: {
        constructEvent: () => {
          throw new Error(providerMessage);
        },
      },
    };

    try {
      await __testing.processWebhookRequest(
        { path: '/api/billing/webhook', body: '{}', headers: { 'stripe-signature': 'bad' } },
        response,
        stripe,
        'secret'
      );
    } finally {
      errorLog.mock.restore();
    }

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'Invalid Stripe webhook payload.');
    assert.equal(response.body.code, 'billing_webhook_invalid');
    assert.equal(response.headers['X-Request-ID'], response.body.requestId);
    assert.equal(JSON.stringify(response.body).includes(providerMessage), false);
  });
});
