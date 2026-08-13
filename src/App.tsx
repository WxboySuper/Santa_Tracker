import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { store } from './store';
import { setActiveOutlookType, setEmergencyMode } from './store/forecastSlice';
import useAutoCategorical from './hooks/useAutoCategorical';
import './App.css';

// Import required libraries 
import 'leaflet/dist/leaflet.css';
import {
  getFirstExposedOutlookType,
  shouldActivateEmergencyMode,
} from './config/productExposureSelectors';

import { useAutoSave } from './hooks/useAutoSave';
import { useFirestoreSleepRecovery } from './hooks/useFirestoreSleepRecovery';
import { setupCycleHistoryListener, useCycleHistoryPersistence } from './utils/cycleHistoryPersistence';
import { WorkflowAwarenessProvider } from './hooks/useWorkflowAwarenessSync';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { EntitlementProvider } from './billing/EntitlementProvider';

// New UI components
import { AppLayout } from './components/Layout';
import HomePage from './pages/HomePage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import AccountPage from './pages/AccountPage';
import PricingPage from './pages/PricingPage';
import { UpdatesPage } from './pages/UpdatesPage';
import BetaLandingPage from './pages/BetaLandingPage';
import BetaInvitePage from './pages/BetaInvitePage';
import BetaAccessGuard from './components/Beta/BetaAccessGuard';
import { ProductAnalyticsRouteTracker } from './components/ProductAnalyticsRouteTracker';
import ToSModal, { hasAcceptedToS } from './components/ToS/ToSModal';
import PrivacyPolicyModal, { hasAcceptedPrivacyPolicy } from './components/PrivacyPolicy/PrivacyPolicyModal';
import { initProductAnalytics } from './lib/productAnalytics';
import { buildFeatureGatedRoutes } from './routing/buildFeatureGatedRoutes';
import { isFeatureExposureDiagnosticsEnabled } from './config/featureExposureDiagnostics';

// Heavy feature routes are lazy-loaded so the application shell stays small and
// independent of the map/editor and secondary workflow chunks.
const ForecastPage = lazy(() => import('./pages/ForecastPage').then((module) => ({ default: module.ForecastPage })));
const DiscussionPage = lazy(() => import('./pages/DiscussionPage').then((module) => ({ default: module.DiscussionPage })));
const VerificationPage = lazy(() => import('./pages/VerificationPage').then((module) => ({ default: module.VerificationPage })));
const MonitorPage = lazy(() => import('./pages/MonitorPage').then((module) => ({ default: module.MonitorPage })));
const CloudLibraryPage = lazy(() => import('./pages/CloudLibraryPage'));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

const FeatureExposureDiagnosticsPage = __GFC_DEV_MODE__
  ? lazy(() =>
      import('./pages/FeatureExposureDiagnosticsPage').then((module) => ({
        default: module.FeatureExposureDiagnosticsPage,
      }))
    )
  : null;

/** Accessible loading placeholder shown while a lazy route chunk downloads. */
const RouteFallback = () => (
  <div className="flex h-full items-center justify-center p-6" role="status" aria-busy="true" aria-label="Loading page">
    <span className="text-sm text-muted-foreground">Loading…</span>
  </div>
);

// Launch gate: set VITE_COMING_SOON=true in the public build to enable pre-launch mode.
// The app auto-unlocks at the launch date/time regardless of the env var.
const LAUNCH_TIME = new Date('2026-03-01T18:00:00.000Z').getTime(); // noon CST
const COMING_SOON_MODE = __GFC_COMING_SOON__;
const BETA_MODE = __GFC_BETA_MODE__;

// Custom hook to manage the launch gate, which checks the current date against a predefined launch time and returns whether the app has launched. It also sets up a timer to update the launched state when the launch time is reached, allowing for real-time transition from coming soon mode to live mode without needing a page refresh.
function useLaunchGate(): boolean {
  const [launched, setLaunched] = useState(() => Date.now() >= LAUNCH_TIME);
  useEffect(() => {
    let launchTimer: ReturnType<typeof setTimeout> | undefined;

    if (!launched) {
      const delay = Math.max(0, LAUNCH_TIME - Date.now());
      launchTimer = setTimeout(() => setLaunched(true), delay);
    }

    return () => {
      if (launchTimer) {
        clearTimeout(launchTimer);
      }
    };
  }, [launched]);
  return launched;
}

// App-level hooks component (runs shared hooks)
const AppHooks = () => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const userId = user?.uid;

  // Use the auto categorical hook to generate categorical outlooks
  useAutoCategorical();

  // Enable account-scoped Auto-Save
  useAutoSave(userId);

  // Pause Firestore while the tab sleeps (Safari IndexedDB recovery)
  useFirestoreSleepRecovery();

  // Hydrate the active account before starting its persistence listener. React runs
  // effect cleanups before new effects, so the previous listener is removed before
  // this clears Redux and the new listener only observes the hydrated scope.
  useCycleHistoryPersistence(userId);
  useEffect(() => {
    return setupCycleHistoryListener(store, userId);
  }, [userId]);

  // Derive emergency mode and the first exposed outlook from build-target exposure.
  useEffect(() => {
    dispatch(setEmergencyMode(shouldActivateEmergencyMode()));
    dispatch(setActiveOutlookType(getFirstExposedOutlookType()));
  }, [dispatch]);

  return null;
};

interface AgreementGateProps {
  showComingSoon: boolean;
}

const getAgreementState = (localBetaBypass: boolean) => ({
  tosAccepted: localBetaBypass || hasAcceptedToS(),
  privacyAccepted: localBetaBypass || hasAcceptedPrivacyPolicy(),
});

const AcceptedApplication: React.FC<{ showComingSoon: boolean }> = ({ showComingSoon }) => (
  <AppProviders>
    <AppHooks />
    <ProductAnalyticsRouteTracker />
    <AppRoutes showComingSoon={showComingSoon} />
  </AppProviders>
);

const useAgreementState = (showComingSoon: boolean) => {
  const localBetaBypass = __GFC_DEV_MODE__ && new URLSearchParams(window.location.search).get('localBetaBypass') === 'true';
  const initial = getAgreementState(localBetaBypass);
  const [tosAccepted, setTosAccepted] = useState(initial.tosAccepted);
  const [privacyAccepted, setPrivacyAccepted] = useState(initial.privacyAccepted);
  useEffect(() => {
    if (privacyAccepted && !showComingSoon) initProductAnalytics();
  }, [privacyAccepted, showComingSoon]);
  useEffect(() => {
    if (!showComingSoon) {
      const next = getAgreementState(localBetaBypass);
      setTosAccepted(next.tosAccepted);
      setPrivacyAccepted(next.privacyAccepted);
    }
  }, [localBetaBypass, showComingSoon]);
  return { tosAccepted, privacyAccepted, setTosAccepted, setPrivacyAccepted };
};

/** Handles the launch-dependent agreement flow before the main app is allowed to initialize. */
const AgreementGate: React.FC<AgreementGateProps> = ({ showComingSoon }) => {
  const { tosAccepted, privacyAccepted, setTosAccepted, setPrivacyAccepted } = useAgreementState(showComingSoon);

  const handleAcceptToS = useCallback(() => {
    setTosAccepted(true);
  }, [setTosAccepted]);

  const handleAcceptPrivacyPolicy = useCallback(() => {
    setPrivacyAccepted(true);
  }, [setPrivacyAccepted]);

  if (showComingSoon || !tosAccepted) {
    return showComingSoon ? <AppRoutes showComingSoon /> : <ToSModal onAccept={handleAcceptToS} />;
  }

  if (!privacyAccepted) {
    return <PrivacyPolicyModal onAccept={handleAcceptPrivacyPolicy} />;
  }

  // Keep the routed product tree behind the agreement boundary. Previously the
  // modal was rendered beside AppRoutes, so pages, providers, and global hooks
  // were live in the DOM before the user accepted the policies.
  return <AcceptedApplication showComingSoon={showComingSoon} />;
};

interface AppRoutesProps {
  showComingSoon: boolean;
}

/** Selects between the public launch gate routes and the full application routes. */
const AppRoutes: React.FC<AppRoutesProps> = ({ showComingSoon }) => {
  if (showComingSoon) {
    return (
      <Routes>
        <Route index element={<ComingSoonPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="beta" element={<BetaLandingPage />} />
      <Route path="beta-access/:invitePath?" element={<BetaInvitePage />} />
      <Route element={<AppLayout />}>
        <Route path="updates" element={<UpdatesPage />} />
        <Route element={<BetaAccessGuard />}>
        <Route index element={<HomePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="admin" element={<Suspense fallback={<RouteFallback />}><AdminPage /></Suspense>} />
        <Route path="cloud" element={<Suspense fallback={<RouteFallback />}><CloudLibraryPage /></Suspense>} />
        <Route path="forecast" element={<Suspense fallback={<RouteFallback />}><ForecastPage /></Suspense>} />
        <Route path="discussion" element={<Suspense fallback={<RouteFallback />}><DiscussionPage /></Suspense>} />
        <Route path="verification" element={<Suspense fallback={<RouteFallback />}><VerificationPage /></Suspense>} />
        <Route path="monitor" element={<Suspense fallback={<RouteFallback />}><MonitorPage /></Suspense>} />
        {__GFC_DEV_MODE__ && isFeatureExposureDiagnosticsEnabled() && FeatureExposureDiagnosticsPage ? (
          <Route
            path="dev/feature-exposure"
            element={
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading diagnostics…</div>}>
                <FeatureExposureDiagnosticsPage />
              </Suspense>
            }
          />
        ) : null}
        {buildFeatureGatedRoutes()}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={BETA_MODE ? '/beta' : '/'} replace />} />
    </Routes>
  );
};

// Main App with Router
interface AppContentProps {
  showComingSoon: boolean;
}

/** Renders the routed application inside the shared providers. */
const AppContent: React.FC<AppContentProps> = ({ showComingSoon }) => (
  <BrowserRouter>
    <AgreementGate showComingSoon={showComingSoon} />
  </BrowserRouter>
);

/** Composes the application providers without coupling them to route markup. */
const AppProviders: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Provider store={store}>
    <AuthProvider>
      <EntitlementProvider>
        <WorkflowAwarenessProvider>{children}</WorkflowAwarenessProvider>
      </EntitlementProvider>
    </AuthProvider>
  </Provider>
);

/** Renders the authenticated application shell and route tree. */
function App() {
  const isLaunched = useLaunchGate();
  const showComingSoon = COMING_SOON_MODE && !isLaunched;

  return <AppContent showComingSoon={showComingSoon} />;
}

export default App;
