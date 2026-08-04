import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Activity, Lock, TrendingUp } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../auth/AuthProvider';
import { isSentryEnabled } from '../instrument';
import './AdminPage.css';

type AdminWindow = 7 | 30;

interface AdminMetricsSummary {
  totalAccounts: number;
  activeDevices: number;
  activeSignedInAccounts: number;
  premiumSubscriptions: number;
  storageBytes: number;
  signups: number;
  signIns: number;
  upgrades: number;
  cancellations: number;
  cloudSaves: number;
  cloudLoads: number;
}

interface AdminDailyMetric extends AdminMetricsSummary {
  date: string;
}

interface AdminMetricsResponse {
  metricsEnabled: boolean;
  window: AdminWindow;
  summary: AdminMetricsSummary;
  dailyMetrics: AdminDailyMetric[];
}

interface ParsedAdminMetricsResponse {
  accessDenied: boolean;
  metricsResponse: AdminMetricsResponse | null;
}

type AdminAccessState = 'disabled' | 'auth_loading' | 'signed_out' | 'denied' | 'allowed';

interface UseAdminMetricsState {
  windowSize: AdminWindow;
  setWindowSize: React.Dispatch<React.SetStateAction<AdminWindow>>;
  loading: boolean;
  error: string | null;
  metricsResponse: AdminMetricsResponse | null;
  accessState: AdminAccessState;
}

const DEFAULT_SUMMARY: AdminMetricsSummary = {
  totalAccounts: 0,
  activeDevices: 0,
  activeSignedInAccounts: 0,
  premiumSubscriptions: 0,
  storageBytes: 0,
  signups: 0,
  signIns: 0,
  upgrades: 0,
  cancellations: 0,
  cloudSaves: 0,
  cloudLoads: 0,
};

/** True when there are one or more daily metric rows to render. */
const hasDailyMetrics = (dailyMetrics: AdminDailyMetric[]): boolean => dailyMetrics.length > 0;

/** Returns the current access-state branch for the admin page shell. */
const getAdminAccessState = ({
  hostedAuthEnabled,
  authLoading,
  status,
  user,
  accessDenied,
}: {
  hostedAuthEnabled: boolean;
  authLoading: boolean;
  status: ReturnType<typeof useAuth>['status'];
  user: ReturnType<typeof useAuth>['user'];
  accessDenied: boolean;
}): AdminAccessState => {
  if (!hostedAuthEnabled) {
    return 'disabled';
  }

  if (authLoading) {
    return 'auth_loading';
  }

  if (status !== 'signed_in' || !user) {
    return 'signed_out';
  }

  if (accessDenied) {
    return 'denied';
  }

  return 'allowed';
};

/** Returns the normalized admin metrics payload shape from one fetch response. */
const parseAdminMetricsResponse = async (
  response: Response
): Promise<ParsedAdminMetricsResponse> => {
  const data = (await response.json().catch(() => ({}))) as Partial<AdminMetricsResponse> & { error?: string };

  if (response.status === 403) {
    return {
      accessDenied: true,
      metricsResponse: null,
    };
  }

  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Unable to load admin metrics right now.');
  }

  return {
    accessDenied: false,
    metricsResponse: {
      metricsEnabled: Boolean(data.metricsEnabled),
      window: data.window === 30 ? 30 : 7,
      summary: data.summary ? { ...DEFAULT_SUMMARY, ...data.summary } : DEFAULT_SUMMARY,
      dailyMetrics: Array.isArray(data.dailyMetrics) ? (data.dailyMetrics as AdminDailyMetric[]) : [],
    },
  };
};

/** Applies one successful admin metrics response. */
const applyAdminMetricsSuccess = (
  parsedResponse: ParsedAdminMetricsResponse,
  setMetricsResponse: React.Dispatch<React.SetStateAction<AdminMetricsResponse | null>>,
  setAccessDenied: React.Dispatch<React.SetStateAction<boolean>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  if (parsedResponse.accessDenied) {
    setMetricsResponse(null);
    setAccessDenied(true);
    setLoading(false);
    return;
  }

  setMetricsResponse(parsedResponse.metricsResponse);
  setLoading(false);
};

/** Applies one admin metrics error. */
const applyAdminMetricsError = (
  nextError: unknown,
  setMetricsResponse: React.Dispatch<React.SetStateAction<AdminMetricsResponse | null>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
) => {
  setMetricsResponse(null);
  setError(nextError instanceof Error ? nextError.message : 'Unable to load admin metrics right now.');
  setLoading(false);
};

/** Fetches the selected admin window using the signed-in user's Firebase token. */
const fetchAdminMetrics = async (user: NonNullable<ReturnType<typeof useAuth>['user']>, windowSize: AdminWindow) => {
  const token = await user.getIdToken();
  const response = await fetch(`/api/admin/metrics?window=${windowSize}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseAdminMetricsResponse(response);
};

/** True when the in-flight admin request is still the latest one issued by the page. */
const isLatestAdminRequest = (
  requestId: number,
  requestIdRef: React.MutableRefObject<number>
) => requestId === requestIdRef.current;

type AdminMetricsSetters = {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMetricsResponse: React.Dispatch<React.SetStateAction<AdminMetricsResponse | null>>;
  setAccessDenied: React.Dispatch<React.SetStateAction<boolean>>;
};

/** Syncs loading and metrics state when admin access is blocked or still resolving. */
const syncAdminMetricsForAccessState = (accessState: AdminAccessState, setters: AdminMetricsSetters) => {
  if (accessState === 'auth_loading') {
    setters.setLoading(true);
    return;
  }

  if (accessState === 'denied') {
    setters.setLoading(false);
    return;
  }

  setters.setLoading(false);
  setters.setMetricsResponse(null);
  setters.setAccessDenied(false);
};

/** Starts one admin metrics request and returns an unmount cleanup handler. */
const subscribeAdminMetrics = (
  user: NonNullable<ReturnType<typeof useAuth>['user']>,
  windowSize: AdminWindow,
  requestIdRef: React.MutableRefObject<number>,
  setters: AdminMetricsSetters
) => {
  let isMounted = true;
  requestIdRef.current += 1;
  const requestId = requestIdRef.current;

  setters.setLoading(true);
  setters.setError(null);
  setters.setAccessDenied(false);

  fetchAdminMetrics(user, windowSize)
    .then((parsedResponse) => {
      if (!isMounted || !isLatestAdminRequest(requestId, requestIdRef)) {
        return;
      }

      applyAdminMetricsSuccess(
        parsedResponse,
        setters.setMetricsResponse,
        setters.setAccessDenied,
        setters.setLoading
      );
    })
    .catch((nextError) => {
      if (!isMounted || !isLatestAdminRequest(requestId, requestIdRef)) {
        return;
      }

      applyAdminMetricsError(nextError, setters.setMetricsResponse, setters.setError, setters.setLoading);
    });

  return () => {
    isMounted = false;
  };
};

/** Loads and normalizes the private admin metrics window plus access state. */
const useAdminMetricsState = (): UseAdminMetricsState => {
  const { hostedAuthEnabled, status, user } = useAuth();
  const [windowSize, setWindowSize] = useState<AdminWindow>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsResponse, setMetricsResponse] = useState<AdminMetricsResponse | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const requestIdRef = useRef(0);
  const authLoading = status === 'loading';
  const accessState = getAdminAccessState({
    hostedAuthEnabled,
    authLoading,
    status,
    user,
    accessDenied,
  });

  useEffect(() => {
    const setters: AdminMetricsSetters = {
      setLoading,
      setError,
      setMetricsResponse,
      setAccessDenied,
    };

    if (accessState !== 'allowed' || !user) {
      syncAdminMetricsForAccessState(accessState, setters);
      return undefined;
    }

    return subscribeAdminMetrics(user, windowSize, requestIdRef, setters);
  }, [accessState, user, windowSize]);

  return {
    windowSize,
    setWindowSize,
    loading,
    error,
    metricsResponse,
    accessState,
  };
};

/** Formats aggregate byte counts into compact admin-friendly storage labels. */
const formatBytes = (value: number): string => {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Formats one admin day key into a compact month/day label. */
const formatDayLabel = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Shared compact admin summary tile. */
const AdminSummaryTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="admin-summary-tile">
    <p>{label}</p>
    <strong>{value}</strong>
  </div>
);

/** Error card shown when the admin endpoint returns a recoverable failure. */
const AdminErrorNotice: React.FC<{ error: string }> = ({ error }) => (
  <Card className="admin-surface-card">
    <CardContent className="admin-card-content">
      <p className="admin-error">{error}</p>
    </CardContent>
  </Card>
);

/** Empty/blocked state shell used for hidden admin access states. */
const AdminStateCard: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}> = ({ title, description, actionLabel, actionHref }) => (
  <div className="admin-page-shell">
    <Card className="admin-surface-card">
      <CardHeader className="admin-card-header">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actionLabel && actionHref ? (
        <CardContent className="admin-card-content">
          <Button asChild variant="outline">
            <Link to={actionHref}>{actionLabel}</Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  </div>
);

/** Lightweight trend rows for the admin window. */
const AdminTrendRows: React.FC<{ dailyMetrics: AdminDailyMetric[] }> = ({ dailyMetrics }) => {
  const peakCloudSaves = Math.max(...dailyMetrics.map((metric) => metric.cloudSaves), 1);

  return (
    <div className="admin-trend-list">
      {dailyMetrics.map((metric) => (
        <div key={metric.date} className="admin-trend-row">
          <div className="admin-trend-labels">
            <strong>{formatDayLabel(metric.date)}</strong>
            <span>{metric.cloudSaves} cloud saves</span>
          </div>
          <div className="admin-trend-bar">
            <div
              className="admin-trend-fill"
              style={{ width: `${Math.max((metric.cloudSaves / peakCloudSaves) * 100, metric.cloudSaves ? 12 : 0)}%` }}
            />
          </div>
          <span className="admin-trend-value">{metric.signIns} sign-ins</span>
        </div>
      ))}
    </div>
  );
};

/** Sends a deliberate error to Sentry for production verification (admin-only surface). */
const AdminSentryTestCard: React.FC = () => {
  if (!isSentryEnabled()) {
    return null;
  }

  return (
    <Card className="admin-surface-card">
      <CardHeader className="admin-card-header">
        <CardTitle>Sentry monitoring</CardTitle>
        <CardDescription>
          Send a test error from this page to verify gfc-web error reporting. Check Issues in Sentry after
          clicking.
        </CardDescription>
      </CardHeader>
      <CardContent className="admin-card-content">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            throw new Error('This is your first error!');
          }}
        >
          Send Sentry test error
        </Button>
      </CardContent>
    </Card>
  );
};

/** Header section for the private admin dashboard. */
const AdminHero: React.FC<{
  windowSize: AdminWindow;
  onSelectWindow: (windowSize: AdminWindow) => void;
}> = ({ windowSize, onSelectWindow }) => (
  <section className="admin-hero">
    <div className="admin-pill">
      <Lock className="h-4 w-4" />
      Private Admin
    </div>
    <div className="admin-hero-copy">
      <div>
        <h1>Hosted metrics</h1>
        <p>Aggregate-only product health for beta operations. No user drill-down and no forecast payload content.</p>
      </div>
      <div className="admin-hero-actions">
        <Badge variant="outline">Window: {windowSize} days</Badge>
        <Button variant={windowSize === 7 ? 'default' : 'outline'} onClick={() => onSelectWindow(7)}>
          Last 7 days
        </Button>
        <Button variant={windowSize === 30 ? 'default' : 'outline'} onClick={() => onSelectWindow(30)}>
          Last 30 days
        </Button>
      </div>
    </div>
  </section>
);

/** Summary card for window-wide action totals. */
const AdminWindowTotalsCard: React.FC<{
  summary: AdminMetricsSummary;
  windowSize: AdminWindow;
}> = ({ summary, windowSize }) => (
  <Card className="admin-surface-card">
    <CardHeader className="admin-card-header">
      <CardTitle className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        Window totals
      </CardTitle>
      <CardDescription>Aggregate product actions across the selected {windowSize}-day window.</CardDescription>
    </CardHeader>
    <CardContent className="admin-card-content">
      <div className="admin-summary-grid admin-summary-grid-compact">
        <AdminSummaryTile label="Signups" value={`${summary.signups}`} />
        <AdminSummaryTile label="Devices (latest day)" value={`${summary.activeDevices}`} />
        <AdminSummaryTile label="Upgrades" value={`${summary.upgrades}`} />
        <AdminSummaryTile label="Cancellations" value={`${summary.cancellations}`} />
        <AdminSummaryTile label="Cloud saves" value={`${summary.cloudSaves}`} />
        <AdminSummaryTile label="Cloud loads" value={`${summary.cloudLoads}`} />
      </div>
    </CardContent>
  </Card>
);

/** Trend card for daily cloud-save and sign-in activity. */
const AdminDailyTrendCard: React.FC<{
  loading: boolean;
  dailyMetrics: AdminDailyMetric[];
}> = ({ loading, dailyMetrics }) => (
  <Card className="admin-surface-card">
    <CardHeader className="admin-card-header">
      <CardTitle className="flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Daily trend
      </CardTitle>
      <CardDescription>Cloud-save volume and sign-in activity for the selected window.</CardDescription>
    </CardHeader>
    <CardContent className="admin-card-content">
      {loading ? (
        <p className="admin-muted-copy">Loading daily metrics...</p>
      ) : hasDailyMetrics(dailyMetrics) ? (
        <AdminTrendRows dailyMetrics={dailyMetrics} />
      ) : (
        <p className="admin-muted-copy">No daily metrics have been recorded yet for this window.</p>
      )}
    </CardContent>
  </Card>
);

/** Main admin metrics surface after access checks have passed. */
const AdminDashboardContent: React.FC<{
  error: string | null;
  loading: boolean;
  metricsResponse: AdminMetricsResponse | null;
  summary: AdminMetricsSummary;
  windowSize: AdminWindow;
  onSelectWindow: (windowSize: AdminWindow) => void;
}> = ({ error, loading, metricsResponse, summary, windowSize, onSelectWindow }) => (
  <div className="admin-page-shell">
    <AdminHero windowSize={windowSize} onSelectWindow={onSelectWindow} />

    {error ? <AdminErrorNotice error={error} /> : null}

    <div className="admin-summary-grid">
      <AdminSummaryTile label="Total accounts" value={loading ? 'Loading...' : `${summary.totalAccounts}`} />
      <AdminSummaryTile label={`Sign-ins (${windowSize}d)`} value={loading ? 'Loading...' : `${summary.signIns}`} />
      <AdminSummaryTile
        label="Premium subscriptions"
        value={loading ? 'Loading...' : `${summary.premiumSubscriptions}`}
      />
      <AdminSummaryTile
        label="Hosted data footprint"
        value={loading ? 'Loading...' : formatBytes(summary.storageBytes)}
      />
    </div>

    <div className="admin-content-grid">
      <AdminWindowTotalsCard summary={summary} windowSize={windowSize} />
      <AdminDailyTrendCard loading={loading} dailyMetrics={metricsResponse?.dailyMetrics ?? []} />
    </div>

    <AdminSentryTestCard />
  </div>
);

/** Hidden admin dashboard for aggregate-only hosted product health metrics. */
const AdminPage: React.FC = () => {
  const {
    windowSize,
    setWindowSize,
    loading,
    error,
    metricsResponse,
    accessState,
  } = useAdminMetricsState();

  const summary = useMemo(() => metricsResponse?.summary ?? DEFAULT_SUMMARY, [metricsResponse]);

  if (accessState === 'disabled') {
    return <Navigate to="/" replace />;
  }

  if (accessState === 'auth_loading') {
    return (
      <AdminStateCard
        title="Checking admin access"
        description="Verifying your hosted account before loading private metrics."
      />
    );
  }

  if (accessState === 'signed_out') {
    return <Navigate to="/account" replace />;
  }

  if (accessState === 'denied') {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminDashboardContent
      error={error}
      loading={loading}
      metricsResponse={metricsResponse}
      summary={summary}
      windowSize={windowSize}
      onSelectWindow={setWindowSize}
    />
  );
};

export default AdminPage;
export { AdminPage };
