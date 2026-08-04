import React from 'react';
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router';
import type { AddToastFn } from '../Layout/AppLayout';
import { useAuth } from '../../auth/AuthProvider';
import { isBetaModeEnabled, isLocalBetaBypassEnabled } from '../../lib/betaAccess';
import { BetaStatusPanel } from './BetaPageLayout';

type AppLayoutOutletContext = { addToast: AddToastFn };

/** Forwards `AppLayout` outlet context through the guard so nested routes keep `addToast`. */
const GuardedOutlet: React.FC = () => {
  const layoutContext = useOutletContext<AppLayoutOutletContext>();
  return <Outlet context={layoutContext} />;
};

/** True when the beta gate should show an access-check loading state. */
const isCheckingBetaAccess = (
  status: ReturnType<typeof useAuth>['status'],
  betaAccessLoading: boolean
): boolean => {
  if (status === 'loading') {
    return true;
  }

  return status === 'signed_in' ? betaAccessLoading : false;
};

/** Full-app route guard that keeps the beta deployment locked to approved accounts. */
const BetaAccessGuard: React.FC = () => {
  const location = useLocation();
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, status } = useAuth();

  if (!isBetaModeEnabled()) {
    return <GuardedOutlet />;
  }

  if (isLocalBetaBypassEnabled(location.search)) {
    return <GuardedOutlet />;
  }

  if (!hostedAuthEnabled) {
    return <Navigate to="/beta" replace />;
  }

  if (isCheckingBetaAccess(status, betaAccessLoading)) {
    return (
      <BetaStatusPanel
        title="Checking beta access"
        description="Verifying whether this account can enter the closed beta."
      />
    );
  }

  if (status === 'signed_in' && betaAccess) {
    return <GuardedOutlet />;
  }

  return <Navigate to="/beta" replace />;
};

export default BetaAccessGuard;
