import React, { lazy, Suspense } from 'react';
import { isFeatureExposed } from '../config/featureExposure';
import VerificationMode from '../components/VerificationMode/VerificationMode';

// Lazily loaded so the Verification v2 dashboard and its gfc-ver-1 engine never
// import as a side effect while verificationRelaunch is disabled.
const ForecastGradeDashboard = lazy(() => import('../components/ForecastGrade/ForecastGradeDashboard'));

/** Verification v2 loading placeholder. */
const DashboardFallback = () => (
  <div className="flex h-full items-center justify-center p-6" aria-busy="true" aria-label="Loading Forecast Grade" />
);

/**
 * Routes /verification to the classic VerificationMode by default and to the
 * Forecast Grade dashboard only when verificationRelaunch is exposed on the
 * current build target. Classic remains fully functional when the flag is off.
 */
export const VerificationPage: React.FC = () => {
  if (isFeatureExposed('verificationRelaunch')) {
    return (
      <Suspense fallback={<DashboardFallback />}>
        <ForecastGradeDashboard />
      </Suspense>
    );
  }

  return <VerificationMode />;
};

export default VerificationPage;
