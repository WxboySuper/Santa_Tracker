import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { HomePage, ForecastPage, DiscussionPage, VerificationPage, MonitorPage, ComingSoonPage, AccountPage, PricingPage, UpdatesPage, AdminPage, BetaLandingPage, BetaInvitePage } from './pages';
import CloudLibraryPage from './pages/CloudLibraryPage';
import BetaAccessGuard from './components/Beta/BetaAccessGuard';
import { ProductAnalyticsRouteTracker } from './components/ProductAnalyticsRouteTracker';
import ToSModal, { hasAcceptedToS } from './components/ToS/ToSModal';
import PrivacyPolicyModal, { hasAcceptedPrivacyPolicy } from './components/PrivacyPolicy/PrivacyPolicyModal';
import { initProductAnalytics } from './lib/productAnalytics';
import { buildFeatureGatedRoutes } from './routing/buildFeatureGatedRoutes';
import { isFeatureExposureDiagnosticsEnabled } from './config/featureExposureDiagnostics';

const FeatureExposureDiagnosticsPage = __GFC_DEV_MODE__
  ? lazy(() =>
      import('./pages/FeatureExposureDiagnosticsPage').then((module) => ({
        default: module.FeatureExposureDiagnosticsPage,
      }))
    )
  : null;

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

/** Handles the launch-dependent agreement flow before the main app is allowed to initialize. */
const AgreementGate: React.FC<AgreementGateProps> = ({ showComingSoon }) => {
  const [tosAccepted, setTosAccepted] = useState(() => hasAcceptedToS());
  const [privacyAccepted, setPrivacyAccepted] = useState(() => hasAcceptedPrivacyPolicy());

  const handleAcceptToS = useCallback(() => {
    setTosAccepted(true);
  }, []);

  const handleAcceptPrivacyPolicy = useCallback(() => {
    setPrivacyAccepted(true);
  }, []);

  useEffect(() => {
    if (privacyAccepted && !showComingSoon) initProductAnalytics();
  }, [privacyAccepted, showComingSoon]);

  useEffect(() => {
    if (showComingSoon) {
      return;
    }

    setTosAccepted(hasAcceptedToS());
    setPrivacyAccepted(hasAcceptedPrivacyPolicy());
  }, [showComingSoon]);

  if (showComingSoon || !tosAccepted) {
    return showComingSoon ? null : <ToSModal onAccept={handleAcceptToS} />;
  }

  if (!privacyAccepted) {
    return <PrivacyPolicyModal onAccept={handleAcceptPrivacyPolicy} />;
  }

  return <><AppHooks /><ProductAnalyticsRouteTracker /></>;
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
        <Route path="admin" element={<AdminPage />} />
        <Route path="cloud" element={<CloudLibraryPage />} />
        <Route path="forecast" element={<ForecastPage />} />
        <Route path="discussion" element={<DiscussionPage />} />
        <Route path="verification" element={<VerificationPage />} />
        <Route path="monitor" element={<MonitorPage />} />
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
    <AppRoutes showComingSoon={showComingSoon} />
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

  return (
    <AppProviders>
      <AppContent showComingSoon={showComingSoon} />
    </AppProviders>
  );
}

export default App;
