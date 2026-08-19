'use strict';

const SENTRY_DSN_PATTERN =
  /^https:\/\/(?:[^@/]+@)?(o\d+\.ingest(?:\.[a-z]{2})?\.sentry\.io)\/(\d+)\/?$/iu;
const SENTRY_UPSTREAM_TIMEOUT_MS = 5000;

/** @returns {{ host: string, projectId: string } | null} Parsed ingest target from a Sentry DSN string. */
function parseSentryDsnString(dsnString) {
  if (!dsnString || typeof dsnString !== 'string') {
    return null;
  }

  const match = dsnString.trim().match(SENTRY_DSN_PATTERN);
  if (!match) {
    return null;
  }

  return {
    host: match[1],
    projectId: match[2],
  };
}

/** @returns {{ host: string, projectId: string } | null} Parsed Sentry ingest target from an envelope header DSN. */
function parseAllowedSentryEndpoint(envelopeBody) {
  const firstLine = envelopeBody.toString('utf8').split('\n').find((line) => line.trim());
  if (!firstLine) {
    return null;
  }

  let header;
  try {
    header = JSON.parse(firstLine);
  } catch {
    return null;
  }

  if (!header?.dsn || typeof header.dsn !== 'string') {
    return null;
  }

  return parseSentryDsnString(header.dsn);
}

/** @returns {string} Upstream envelope URL for a validated Sentry host and project id. */
function buildEnvelopeUrl(host, projectId) {
  return `https://${host}/api/${projectId}/envelope/`;
}

/** @returns {{ host: string, projectId: string } | null} Browser-facing Sentry ingest target for the tunnel. */
function getConfiguredSentryEndpoint() {
  const browserDsn = process.env.SENTRY_BROWSER_DSN || process.env.SENTRY_DSN || '';
  return parseSentryDsnString(browserDsn);
}

/** @returns {boolean} Whether the client envelope targets the same Sentry project as the server. */
function clientEndpointMatchesConfigured(clientEndpoint, configuredEndpoint) {
  if (!clientEndpoint) {
    return false;
  }

  return (
    clientEndpoint.host === configuredEndpoint.host &&
    clientEndpoint.projectId === configuredEndpoint.projectId
  );
}

const attachUpstreamAbortHandlers = (req, res, controller) => {
  const abortIfDisconnected = () => {
    if (req.destroyed || res.destroyed) {
      controller.abort();
    }
  };
  req.once('close', abortIfDisconnected);
  res.once('close', abortIfDisconnected);

  return () => {
    req.removeListener('close', abortIfDisconnected);
    res.removeListener('close', abortIfDisconnected);
  };
};

const endResponseIfWritable = (res, status) => {
  if (!res.destroyed && !res.headersSent) {
    res.status(status).end();
  }
};

const forwardSentryEnvelope = async (targetUrl, req, res, envelopeBody) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SENTRY_UPSTREAM_TIMEOUT_MS);
  const removeAbortHandlers = attachUpstreamAbortHandlers(req, res, controller);

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelopeBody,
      signal: controller.signal,
    });
    endResponseIfWritable(res, upstream.status);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      throw error;
    }
    endResponseIfWritable(res, 504);
  } finally {
    clearTimeout(timeoutId);
    removeAbortHandlers();
  }
};

const createSentryTunnelHandler = (targetUrl, configuredEndpoint) => async (req, res) => {
  try {
    const envelopeBody = req.body;
    if (!envelopeBody || !envelopeBody.length) {
      res.status(400).end();
      return;
    }

    const clientEndpoint = parseAllowedSentryEndpoint(envelopeBody);
    if (!clientEndpointMatchesConfigured(clientEndpoint, configuredEndpoint)) {
      res.status(400).end();
      return;
    }

    await forwardSentryEnvelope(targetUrl, req, res, envelopeBody);
  } catch (err) {
    console.error('[analytics] sentry tunnel failed:', err);
    endResponseIfWritable(res, 500);
  }
};

/** Registers POST /api/sentry-tunnel to proxy browser envelopes past ad blockers. */
function registerSentryTunnelRoutes(app, express, rateLimit) {
  const configuredEndpoint = getConfiguredSentryEndpoint();
  if (!configuredEndpoint) {
    console.warn(
      '[analytics] sentry tunnel disabled: SENTRY_BROWSER_DSN (or SENTRY_DSN) is missing or invalid'
    );
    return;
  }

  const targetUrl = buildEnvelopeUrl(configuredEndpoint.host, configuredEndpoint.projectId);

  const tunnelRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post(
    '/api/sentry-tunnel',
    tunnelRateLimit,
    express.raw({ type: () => true, limit: '100kb' }),
    createSentryTunnelHandler(targetUrl, configuredEndpoint)
  );
}

module.exports = {
  registerSentryTunnelRoutes,
  parseAllowedSentryEndpoint,
  parseSentryDsnString,
  buildEnvelopeUrl,
  getConfiguredSentryEndpoint,
};
