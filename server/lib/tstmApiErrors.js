'use strict';

/** Machine-readable reasons for cached Auto-TSTM API responses. */
const TSTM_ERROR_REASON = {
  CACHE_MISS: 'cache_miss',
  CACHE_STALE: 'cache_stale',
  CACHE_CORRUPT: 'cache_corrupt',
  UNAVAILABLE: 'unavailable',
};

/** Sends a sanitized JSON error without internal implementation details. */
const sendTstmApiError = (res, status, error, reason) => {
  const body = { error };
  if (reason) {
    body.reason = reason;
  }
  res.status(status).json(body);
};

module.exports = {
  TSTM_ERROR_REASON,
  sendTstmApiError,
};
