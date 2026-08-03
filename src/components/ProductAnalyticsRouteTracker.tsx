import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackProductPageView } from '../lib/productAnalytics';

/** Sends one privacy-normalized Umami page view per SPA route. */
export function ProductAnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackProductPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
