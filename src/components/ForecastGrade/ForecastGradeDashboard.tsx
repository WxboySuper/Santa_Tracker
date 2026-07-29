import React from 'react';

/**
 * Temporary stub so verificationRelaunch can wire the route/surfaces before the
 * real dashboard shell lands in the next stacked PR.
 */
const ForecastGradeDashboard: React.FC = () => (
  <div className="flex h-full items-center justify-center p-6" data-testid="forecast-grade-dashboard">
    Forecast Grade dashboard
  </div>
);

export default ForecastGradeDashboard;
