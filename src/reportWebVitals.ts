import type { ReportCallback } from 'web-vitals';

/** Registers performance measurement callbacks for Core Web Vitals reporting. Only runs if a valid handler is provided. */
const reportWebVitals = (onPerfEntry?: ReportCallback) => {
  if (typeof onPerfEntry === 'function') {
    import('web-vitals')
      .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        onCLS(onPerfEntry);
        onFCP(onPerfEntry);
        onINP(onPerfEntry);
        onLCP(onPerfEntry);
        onTTFB(onPerfEntry);
      })
      .catch((err) => {
        // Dynamic import failed; log for diagnostics.
        console.error('Failed to load web-vitals', err);
      });
  }
};

export default reportWebVitals;
