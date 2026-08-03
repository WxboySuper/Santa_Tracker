import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  Activity,
  CircleUserRound,
  Cloud,
  Crown,
  LoaderCircle,
  LogOut,
  Mail,
  Palette,
  Trash2,
} from "lucide-react";
import { Badge, type BadgeProps } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useAuth } from "../auth/AuthProvider";
import { useEntitlement } from "../billing/EntitlementProvider";
import { useUserMetrics } from "../metrics/useUserMetrics";
import { useWorkflowAwareness } from "../hooks/useWorkflowAwarenessSync";
import type { RootState } from "../store";
import { selectForecastCycle, selectSavedCycles } from "../store/forecastSlice";
import { computeHomeStats } from "./homeUtils";
import { isFeatureExposed } from "../config/featureExposure";
import "./AccountPage.css";

type AuthMode = "sign_in" | "sign_up";
type SyncStatus = ReturnType<typeof useAuth>["settingsSyncStatus"];

interface SyncStatusMeta {
  label: string;
  variant: BadgeProps["variant"];
}

/** Maps Firebase provider ids to short labels for the account UI. */
const getProviderLabel = (providerId: string): string => {
  switch (providerId) {
    case "google.com":
      return "Google";
    case "password":
      return "Email / Password";
    default:
      return providerId;
  }
};

/** Converts the raw settings status into the one compact badge shown on the signed-in account page. */
const getSyncStatusMeta = (settingsSyncStatus: SyncStatus): SyncStatusMeta => {
  switch (settingsSyncStatus) {
    case "synced":
      return { label: "Synced", variant: "success" };
    case "syncing":
      return { label: "Syncing", variant: "secondary" };
    case "error":
      return { label: "Needs Attention", variant: "warning" };
    case "disabled":
      return { label: "Local Only", variant: "outline" };
    case "idle":
    default:
      return { label: "Ready", variant: "secondary" };
  }
};

/** Renders the save button label while optionally showing a loading spinner. */
const renderSaveDefaultsButtonLabel = (
  savingDefaults: boolean,
): React.ReactNode => (
  <>
    {savingDefaults ? (
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
    ) : null}
    Save Changes
  </>
);

/** Returns the user-facing current plan price based on the active entitlement interval. */
const getPlanLabel = (
  premiumActive: boolean,
  planInterval: ReturnType<typeof useEntitlement>["planInterval"],
  effectiveSource: ReturnType<typeof useEntitlement>["effectiveSource"],
): string => {
  if (!premiumActive) {
    return "Free Plan";
  }

  if (planInterval === "annual") {
    return "Premium Annual";
  }

  if (planInterval === "monthly") {
    return "Premium Monthly";
  }

  return effectiveSource === "beta_override"
    ? "Premium Beta Access"
    : "Premium";
};

/** Returns the short helper copy used under the billing summary grid. */
const getBillingSupportCopy = (
  effectiveSource: ReturnType<typeof useEntitlement>["effectiveSource"],
  premiumActive: boolean,
  annualPromoActive: boolean,
): string | null => {
  if (effectiveSource === "beta_override") {
    return "Premium is currently being granted through the beta override path, so no live Stripe subscription is required yet.";
  }

  if (!premiumActive) {
    return "If premium lapses later, cloud writes and background sync will be disabled while local work remains fully available.";
  }

  if (annualPromoActive) {
    return "Annual intro pricing is currently active on this deployment.";
  }

  return null;
};

/** Returns the CTA variant for the pricing button based on current entitlement state. */
const getPricingButtonVariant = (
  premiumActive: boolean,
): "outline" | "default" => (premiumActive ? "outline" : "default");

/** Returns the current plan price shown in the billing summary card. */
const getCurrentPlanPrice = (
  premiumActive: boolean,
  planInterval: ReturnType<typeof useEntitlement>["planInterval"],
  monthlyDisplayPrice: string,
  annualDisplayPrice: string,
): string => {
  if (!premiumActive) {
    return "$0";
  }

  if (planInterval === "annual") {
    return annualDisplayPrice;
  }

  if (planInterval === "monthly") {
    return monthlyDisplayPrice;
  }

  return "Included";
};

/** Formats the last recorded active-day key into a compact account-friendly date label. */
const formatLastActiveDate = (value: string | null): string => {
  if (!value) {
    return "No activity yet";
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Decorative background accents shared by the account hero. */
const AccountHeroBackdrop: React.FC = () => (
  <>
    <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-primary/8 blur-2xl" />
  </>
);

/** Main content stack inside the account hero shell. */
const AccountHeroContent: React.FC<{
  description: string;
  children?: React.ReactNode;
}> = ({ description, children }) => (
  <div className="account-hero-content">
    <div className="account-hero-copy">
      <div className="account-pill">
        <CircleUserRound className="h-4 w-4" />
        Account
      </div>
      <div className="account-hero-text">
        <h1>Account</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  </div>
);

/** Shared hero used for signed-in, signed-out, and local-only account states. */
const AccountHero: React.FC<{
  description: string;
  children?: React.ReactNode;
}> = ({ description, children }) => (
  <section className="account-hero">
    <AccountHeroBackdrop />
    <AccountHeroContent description={description}>
      {children}
    </AccountHeroContent>
  </section>
);

/** Shows the signed-in identity details as compact chips under the account hero. */
const AccountIdentityChips: React.FC<{
  email: string;
  providerLabels: string[];
  statusMeta?: SyncStatusMeta;
}> = ({ email, providerLabels, statusMeta }) => (
  <div className="account-chip-row">
    <span className="account-chip account-chip-strong">{email}</span>
    {providerLabels.map((provider) => (
      <span key={provider} className="account-chip">
        {provider}
      </span>
    ))}
    {statusMeta ? (
      <Badge variant={statusMeta.variant} className="account-sync-badge">
        {statusMeta.label}
      </Badge>
    ) : null}
  </div>
);

/** Small summary tile that keeps the profile card readable and compact. */
const SummaryTile: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="account-summary-tile">
    <p>{label}</p>
    <strong>{value}</strong>
  </div>
);

/** Small two-column summary row for the signed-in profile card. */
const ProfileSummaryGrid: React.FC<{
  email: string;
  providerLabels: string[];
}> = ({ email, providerLabels }) => (
  <div className="grid gap-4 md:grid-cols-2">
    <SummaryTile label="Email" value={email} />
    <SummaryTile
      label="Sign-in Method"
      value={
        providerLabels.length > 0 ? providerLabels.join(", ") : "Unavailable"
      }
    />
  </div>
);

/** Editable byline section for the signed-in account card. */
const DiscussionDefaultsSection: React.FC<{
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
}> = ({ defaultForecasterName, setDefaultForecasterName }) => (
  <div className="account-subsection-card">
    <div className="account-subsection-header">
      <h2>Discussion defaults</h2>
      <p>
        Set the name that should prefill the forecaster field when you write a
        discussion.
      </p>
    </div>

    <div className="account-field-group">
      <label
        htmlFor="default-forecaster-name"
        className="text-sm font-medium text-foreground"
      >
        Default forecaster name
      </label>
      <Input
        id="default-forecaster-name"
        type="text"
        value={defaultForecasterName}
        onChange={(e) => setDefaultForecasterName(e.target.value)}
        placeholder="Your name or preferred byline"
        maxLength={100}
      />
    </div>
  </div>
);

/** Bottom action row for saving defaults and ending the current session. */
/** Opt-in disclosure for the metadata-only workflow awareness feature. */
const WorkflowAwarenessSection: React.FC<{
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}> = ({ enabled, onEnabledChange }) => (
  <div className="account-subsection-card">
    <div className="account-subsection-header">
      <h2>Workflow awareness</h2>
      <p>
        Share only cycle IDs, workflow status, dates, and version relationships to help Home surface unfinished work.
        Forecast maps, geometry, discussions, package content, and map views never upload here.
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className="account-button-row"
      onClick={() => onEnabledChange(!enabled)}
    >
      <Badge variant={enabled ? "success" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
      <span className="text-sm text-muted-foreground">{enabled ? "Disable and delete shared awareness metadata" : "Enable metadata-only awareness sync"}</span>
    </button>
  </div>
);

/** Renders one account action row for an authenticated user. */
const SignedInActionRow: React.FC<{
  savingDefaults: boolean;
  saveMessage: string | null;
  onSaveDefaults: () => void;
  onOpenForecast: () => void;
  onSignOut: () => void;
}> = ({
  savingDefaults,
  saveMessage,
  onSaveDefaults,
  onOpenForecast,
  onSignOut,
}) => (
  <div className="account-action-row">
    <div className="account-action-group">
      <Button onClick={onSaveDefaults} disabled={savingDefaults}>
        {renderSaveDefaultsButtonLabel(savingDefaults)}
      </Button>
      {saveMessage ? (
        <p className="account-inline-message">{saveMessage}</p>
      ) : null}
    </div>

    <div className="account-button-row">
      <Button variant="ghost" asChild>
        <Link to="/forecast" onClick={onOpenForecast}>
          Open Forecast
        </Link>
      </Button>
      <Button variant="outline" onClick={onSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  </div>
);

/** Cloud library access card for premium users. */
const CloudLibraryCardHeader: React.FC = () => (
  <CardHeader className="account-section-header">
    <div className="account-section-topline">
      <div className="account-section-copy">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Cloud className="h-6 w-6" />
          Cloud Cycles
        </CardTitle>
        <CardDescription>
          Access, save, and organize your forecasts in the cloud. Available on
          all your devices.
        </CardDescription>
      </div>
    </div>
  </CardHeader>
);

/** Body copy and CTA for the premium cloud-library account card. */
const CloudLibraryCardContent: React.FC = () => (
  <CardContent className="account-section-content">
    <p className="mb-4 text-sm text-muted-foreground">
      Your premium subscription includes hosted access to all your saved
      forecast cycles. Save time by reusing previous patterns and maintain
      consistency across multiple devices.
    </p>
    <Button asChild>
      <Link to="/cloud">
        <Cloud className="mr-2 h-4 w-4" />
        Open Cloud Library
      </Link>
    </Button>
  </CardContent>
);

/** Cloud library access card for premium users. */
const CloudLibraryCard: React.FC = () => {
  const { premiumActive } = useEntitlement();

  if (!premiumActive) {
    return null; // Only show for premium users
  }

  return (
    <Card>
      <CloudLibraryCardHeader />
      <CloudLibraryCardContent />
    </Card>
  );
};

/** Local-only entry to the reusable product library; absent from every hosted build. */
const CustomProductsCard: React.FC = () => {
  const { premiumActive } = useEntitlement();
  if (!isFeatureExposed('customProducts') || !premiumActive) return null;

  return (
    <Card>
      <CardHeader className="account-section-header">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Palette className="h-6 w-6" />
          Reusable custom products
        </CardTitle>
        <CardDescription>Build ordered category templates and snapshot them into future forecasts.</CardDescription>
      </CardHeader>
      <CardContent className="account-section-content">
        <Button asChild><Link to="/custom-products">Manage Custom Products</Link></Button>
      </CardContent>
    </Card>
  );
};

/** Billing summary card for Phase 3 subscription state and management. */
const BillingCardHeader: React.FC<{
  premiumActive: boolean;
  planLabel: string;
}> = ({ premiumActive, planLabel }) => (
  <CardHeader className="account-section-header">
    <div className="account-section-topline">
      <div className="account-section-copy">
        <CardTitle className="text-2xl">Billing & Premium</CardTitle>
        <CardDescription>
          Premium funds hosted sync and storage. Core forecasting workflows
          remain free.
        </CardDescription>
      </div>
      <Badge
        variant={premiumActive ? "success" : "outline"}
        className="account-plan-badge"
      >
        {planLabel}
      </Badge>
    </div>
  </CardHeader>
);

/** Small summary grid used by the billing card. */
const BillingSummaryGrid: React.FC<{
  billingStatus: string;
  currentPlanPrice: string;
}> = ({ billingStatus, currentPlanPrice }) => (
  <div className="account-summary-grid">
    <SummaryTile label="Billing status" value={billingStatus || "inactive"} />
    <SummaryTile label="Current plan price" value={currentPlanPrice} />
  </div>
);

/** Action row for billing management and pricing navigation. */
const BillingActionRow: React.FC<{
  stripeCustomerId: string | null;
  billingEnabled: boolean;
  openingPortal: boolean;
  premiumActive: boolean;
  onOpenPortal: () => void;
}> = ({
  stripeCustomerId,
  billingEnabled,
  openingPortal,
  premiumActive,
  onOpenPortal,
}) => (
  <div className="account-button-row">
    {stripeCustomerId && billingEnabled ? (
      <Button variant="outline" onClick={onOpenPortal} disabled={openingPortal}>
        {openingPortal ? (
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Manage Subscription
      </Button>
    ) : null}

    <Button asChild variant={getPricingButtonVariant(premiumActive)}>
      <Link to="/pricing">
        <Crown className="mr-2 h-4 w-4" />
        View Pricing
      </Link>
    </Button>
  </div>
);

/** Supporting helper text and error state inside the billing card body. */
const BillingCardMessages: React.FC<{
  supportCopy: string | null;
  portalMessage: string | null;
  error: string | null;
}> = ({ supportCopy, portalMessage, error }) => (
  <>
    {supportCopy ? (
      <p className="text-sm text-muted-foreground">{supportCopy}</p>
    ) : null}
    {portalMessage || error ? (
      <p className="text-sm text-destructive">{portalMessage ?? error}</p>
    ) : null}
  </>
);

/** Main billing card content so the top-level card tree stays flatter. */
const BillingCardContent: React.FC<{
  billingStatus: string;
  currentPlanPrice: string;
  supportCopy: string | null;
  portalMessage: string | null;
  error: string | null;
  stripeCustomerId: string | null;
  billingEnabled: boolean;
  openingPortal: boolean;
  premiumActive: boolean;
  onOpenPortal: () => void;
}> = ({
  billingStatus,
  currentPlanPrice,
  supportCopy,
  portalMessage,
  error,
  stripeCustomerId,
  billingEnabled,
  openingPortal,
  premiumActive,
  onOpenPortal,
}) => (
  <CardContent className="account-section-content">
    <BillingSummaryGrid
      billingStatus={billingStatus}
      currentPlanPrice={currentPlanPrice}
    />
    <BillingCardMessages
      supportCopy={supportCopy}
      portalMessage={portalMessage}
      error={error}
    />
    <BillingActionRow
      stripeCustomerId={stripeCustomerId}
      billingEnabled={billingEnabled}
      openingPortal={openingPortal}
      premiumActive={premiumActive}
      onOpenPortal={onOpenPortal}
    />
  </CardContent>
);

/** Billing summary card for Phase 3 subscription state and management. */
const BillingCard: React.FC = () => {
  const {
    annualPromoActive,
    annualDisplayPrice,
    billingEnabled,
    billingStatus,
    effectiveSource,
    error,
    monthlyDisplayPrice,
    openBillingPortal,
    planInterval,
    premiumActive,
    stripeCustomerId,
  } = useEntitlement();
  const [portalMessage, setPortalMessage] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const currentPlanPrice = getCurrentPlanPrice(
    premiumActive,
    planInterval,
    monthlyDisplayPrice,
    annualDisplayPrice,
  );
  const planLabel = getPlanLabel(premiumActive, planInterval, effectiveSource);
  const supportCopy = getBillingSupportCopy(
    effectiveSource,
    premiumActive,
    annualPromoActive,
  );

  /** Opens the Stripe billing portal and surfaces any failure as local account feedback. */
  const handleOpenPortal = async () => {
    setPortalMessage(null);
    setOpeningPortal(true);

    try {
      await openBillingPortal();
    } catch (nextError) {
      setPortalMessage(
        nextError instanceof Error
          ? nextError.message
          : "Unable to open billing management right now.",
      );
    } finally {
      setOpeningPortal(false);
    }
  };

  /** Wraps the portal action so button handlers stay synchronous. */
  const handleOpenPortalClick = () => {
    handleOpenPortal().catch(() => {
      // Billing feedback is already surfaced by handleOpenPortal.
    });
  };

  return (
    <Card className="account-surface-card">
      <BillingCardHeader premiumActive={premiumActive} planLabel={planLabel} />
      <BillingCardContent
        billingStatus={billingStatus}
        currentPlanPrice={currentPlanPrice}
        supportCopy={supportCopy}
        portalMessage={portalMessage}
        error={error}
        stripeCustomerId={stripeCustomerId}
        billingEnabled={billingEnabled}
        openingPortal={openingPortal}
        premiumActive={premiumActive}
        onOpenPortal={handleOpenPortalClick}
      />
    </Card>
  );
};

/** True when password is the account's only supported reauthentication provider. */
const accountUsesPasswordReauthentication = (
  user: ReturnType<typeof useAuth>["user"],
): boolean => {
  const providerIds = new Set(
    user?.providerData.map((provider) => provider.providerId) ?? [],
  );
  if (!providerIds.has("password")) return false;
  return !providerIds.has("google.com");
};

/** True when the destructive form has every provider-specific credential. */
const canSubmitAccountDeletion = (
  confirmation: string,
  usesPassword: boolean,
  password: string,
): boolean => {
  if (confirmation !== "DELETE") return false;
  if (!usesPassword) return true;
  return password.length > 0;
};

/** Owns destructive account state while keeping the card markup declarative. */
const useAccountDeletionAction = (usesPassword: boolean) => {
  const { deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = canSubmitAccountDeletion(confirmation, usesPassword, password);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(usesPassword ? password : undefined);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete your account right now.");
      setDeleting(false);
    }
  };

  return {
    confirmation,
    setConfirmation,
    password,
    setPassword,
    deleting,
    deleteError,
    canDelete,
    handleDelete,
  };
};

/** Password field shown only for password-only Firebase accounts. */
const AccountDeletionPasswordField: React.FC<{
  visible: boolean;
  password: string;
  deleting: boolean;
  onChange: (value: string) => void;
}> = ({ visible, password, deleting, onChange }) => {
  if (!visible) return null;
  return (
    <div className="account-field-group">
      <label htmlFor="delete-account-password" className="text-sm font-medium text-foreground">
        Current password
      </label>
      <Input
        id="delete-account-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => onChange(event.target.value)}
        disabled={deleting}
      />
    </div>
  );
};

/** Destructive button label isolated from the deletion form's control flow. */
const AccountDeletionButtonLabel: React.FC<{ deleting: boolean }> = ({ deleting }) => {
  if (deleting) {
    return <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Deleting account…</>;
  }
  return <><Trash2 className="mr-2 h-4 w-4" />Permanently delete account</>;
};

/** Destructive account lifecycle control with provider reauthentication and explicit confirmation. */
const AccountDeletionCard: React.FC = () => {
  const { user } = useAuth();
  const usesPassword = accountUsesPasswordReauthentication(user);
  const action = useAccountDeletionAction(usesPassword);

  return (
    <Card className="account-danger-card">
      <CardHeader className="account-section-header">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Trash2 className="h-6 w-6" />
          Delete account
        </CardTitle>
        <CardDescription>
          Permanently remove your hosted profile, settings, progress metrics, cloud cycles, and account sign-in.
          Local saves on this device are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent className="account-section-content">
        <AccountDeletionPasswordField
          visible={usesPassword}
          password={action.password}
          deleting={action.deleting}
          onChange={action.setPassword}
        />
        <div className="account-field-group">
          <label htmlFor="delete-account-confirmation" className="text-sm font-medium text-foreground">
            Type DELETE to confirm
          </label>
          <Input
            id="delete-account-confirmation"
            value={action.confirmation}
            onChange={(event) => action.setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={action.deleting}
          />
        </div>
        <p className="account-support-copy">
          You will be asked to authenticate again. Any active premium subscription linked to this account will end.
          This action cannot be undone.
        </p>
        {action.deleteError ? <p className="account-error-box" role="alert">{action.deleteError}</p> : null}
        <Button
          variant="destructive"
          disabled={!action.canDelete || action.deleting}
          onClick={() => { action.handleDelete().catch(() => undefined); }}
        >
          <AccountDeletionButtonLabel deleting={action.deleting} />
        </Button>
      </CardContent>
    </Card>
  );
};

/** Header block for the signed-in user's progress-only account metrics card. */
const MetricsCardHeader: React.FC = () => (
  <CardHeader className="account-section-header">
    <div className="account-section-topline">
      <div className="account-section-copy">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Activity className="h-6 w-6" />
          Forecast Workspace Stats
        </CardTitle>
        <CardDescription>
          Activity and forecasting totals for the work you have already put into
          GFC.
        </CardDescription>
      </div>
    </div>
  </CardHeader>
);

/** Main metric grid and support copy for the signed-in user's activity card. */
const MetricsCardContent: React.FC<{
  metrics: ReturnType<typeof useUserMetrics>["metrics"];
  localStats: ReturnType<typeof computeHomeStats>;
  loading: boolean;
  error: string | null;
}> = ({ metrics, localStats, loading, error }) => (
  <CardContent className="account-section-content">
    <div className="account-summary-grid">
      <SummaryTile
        label="Active day streak"
        value={loading ? "Loading..." : `${metrics.activeDayStreak}`}
      />
      <SummaryTile
        label="Total active days"
        value={loading ? "Loading..." : `${metrics.totalActiveDays}`}
      />
      <SummaryTile
        label="Forecast saves"
        value={loading ? "Loading..." : `${metrics.cyclesCreated}`}
      />
      <SummaryTile
        label="Cloud saves"
        value={loading ? "Loading..." : `${metrics.cloudCyclesSaved}`}
      />
      <SummaryTile
        label="Discussions saved"
        value={loading ? "Loading..." : `${metrics.discussionsWritten}`}
      />
      <SummaryTile
        label="Verification runs"
        value={loading ? "Loading..." : `${metrics.verificationSessionsRun}`}
      />
    </div>

    <div className="account-subsection-card">
      <div className="account-subsection-header">
        <h2>Forecast workspace stats</h2>
        <p>
          Local forecasting activity moved here so the Home page can stay
          focused on getting back into work.
        </p>
      </div>

      <div className="account-summary-grid">
        <SummaryTile label="Streak" value={`${localStats.forecastStreak}`} />
        <SummaryTile
          label="Total forecasts made"
          value={`${localStats.totalForecastsMade}`}
        />
        <SummaryTile
          label="Total cycles made"
          value={`${localStats.totalCyclesMade}`}
        />
      </div>
    </div>

    <p className="account-support-copy">
      Last active day:{" "}
      <strong>
        {loading ? "Loading..." : formatLastActiveDate(metrics.lastActiveDate)}
      </strong>
    </p>
    {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
  </CardContent>
);

/** Progress-only account metrics card fed by the hosted Firestore metrics document. */
const MetricsCard: React.FC = () => {
  const { metrics, loading, error } = useUserMetrics();
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector((state: RootState) =>
    selectSavedCycles(state),
  );
  const localStats = useMemo(
    () => computeHomeStats(forecastCycle, savedCycles),
    [forecastCycle, savedCycles],
  );

  return (
    <Card className="account-surface-card">
      <MetricsCardHeader />
      <MetricsCardContent
        metrics={metrics}
        localStats={localStats}
        loading={loading}
        error={error}
      />
    </Card>
  );
};

/** Signed-in primary card with the only profile setting exposed in Phase 2. */
const SignedInPrimaryCard: React.FC<{
  email: string;
  providerLabels: string[];
  defaultForecasterName: string;
  setDefaultForecasterName: React.Dispatch<React.SetStateAction<string>>;
  awarenessEnabled: boolean;
  onAwarenessEnabledChange: (enabled: boolean) => void;
  forecastUiMessage: string | null;
  savingDefaults: boolean;
  saveMessage: string | null;
  onSaveDefaults: () => void;
  onOpenForecast: () => void;
  onSignOut: () => void;
}> = ({
  email,
  providerLabels,
  defaultForecasterName,
  setDefaultForecasterName,
  awarenessEnabled,
  onAwarenessEnabledChange,
  savingDefaults,
  saveMessage,
  onSaveDefaults,
  onOpenForecast,
  onSignOut,
}) => (
  <Card className="account-surface-card">
    <CardHeader className="account-section-header">
      <CardTitle className="text-2xl">Profile & Preferences</CardTitle>
      <CardDescription>
        Keep your sign-in details and your default discussion byline ready
        wherever you open GFC.
      </CardDescription>
      <ProfileSummaryGrid email={email} providerLabels={providerLabels} />
    </CardHeader>

    <CardContent className="account-section-content">
      <DiscussionDefaultsSection
        defaultForecasterName={defaultForecasterName}
        setDefaultForecasterName={setDefaultForecasterName}
      />
      <WorkflowAwarenessSection
        enabled={awarenessEnabled}
        onEnabledChange={onAwarenessEnabledChange}
      />
      <SignedInActionRow
        savingDefaults={savingDefaults}
        saveMessage={saveMessage}
        onSaveDefaults={onSaveDefaults}
        onOpenForecast={onOpenForecast}
        onSignOut={onSignOut}
      />
    </CardContent>
  </Card>
);

/** Signed-in account experience focused on identity, defaults, and session control. */
const SignedInAccountView: React.FC = () => {
  const {
    user,
    signOutUser,
    settingsSyncStatus,
    syncedSettings,
    updateSyncedSettings,
  } = useAuth();
  const [defaultForecasterName, setDefaultForecasterName] = useState(
    () => syncedSettings?.defaultForecasterName ?? user?.displayName ?? "",
  );
  const [forecastUiMessage, setForecastUiMessage] = useState<string | null>(
    null,
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const { enabled: awarenessEnabled, setEnabled: setAwarenessEnabled } = useWorkflowAwareness();

  const providerLabels = useMemo(
    () =>
      (user?.providerData ?? [])
        .map((provider) => getProviderLabel(provider.providerId))
        .filter(Boolean),
    [user],
  );
  const statusMeta = getSyncStatusMeta(settingsSyncStatus);

  useEffect(() => {
    setDefaultForecasterName(
      syncedSettings?.defaultForecasterName ?? user?.displayName ?? "",
    );
  }, [syncedSettings?.defaultForecasterName, user?.displayName]);

  /** Saves the discussion default byline into the synced user settings document. */
  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setSaveMessage(null);

    try {
      await updateSyncedSettings({
        defaultForecasterName: defaultForecasterName.trim(),
      });
      setSaveMessage("Saved to your account.");
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Unable to save right now.",
      );
    } finally {
      setSavingDefaults(false);
    }
  };

  /** Wraps the async save action for a button click without leaking promise handling into JSX. */
  const handleSaveDefaultsClick = () => {
    handleSaveDefaults().catch(() => {
      // Save feedback is already surfaced by handleSaveDefaults.
    });
  };

  /** Wraps sign-out for button usage while shared auth state handles any failure messaging. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {
      // Auth failures surface through shared auth state.
    });
  };

  /** Clear any forecast UI message when opening forecast. */
  const handleOpenForecastClick = () => {
    setForecastUiMessage(null);
  };

  return (
    <div className="account-page-stack">
      <AccountHero description="Keep your profile and app defaults ready across devices while the core forecasting workflow stays yours.">
        <AccountIdentityChips
          email={user?.email ?? "Unavailable"}
          providerLabels={providerLabels}
          statusMeta={statusMeta}
        />
      </AccountHero>

      <div className="account-signed-grid">
        <div className="account-main-stack">
          <SignedInPrimaryCard
            email={user?.email ?? "Unavailable"}
            providerLabels={providerLabels}
            defaultForecasterName={defaultForecasterName}
            setDefaultForecasterName={setDefaultForecasterName}
            awarenessEnabled={awarenessEnabled}
            onAwarenessEnabledChange={setAwarenessEnabled}
            forecastUiMessage={forecastUiMessage}
            savingDefaults={savingDefaults}
            saveMessage={saveMessage}
            onSaveDefaults={handleSaveDefaultsClick}
            onOpenForecast={handleOpenForecastClick}
            onSignOut={handleSignOutClick}
          />
          <CloudLibraryCard />
          <CustomProductsCard />
        </div>
        <div className="account-side-stack">
          <MetricsCard />
          <BillingCard />
          <AccountDeletionCard />
        </div>
      </div>
    </div>
  );
};

/** Shared sign-in header for the signed-out account flow. */
const SignInCardHeader: React.FC = () => (
  <CardHeader className="account-section-header">
    <CardTitle className="text-2xl">Sign in or create an account</CardTitle>
    <CardDescription>
      Keep your profile and app defaults ready across devices. Signing in is
      optional, and core forecasting stays free.
    </CardDescription>
  </CardHeader>
);

/** Email and password form used for both sign-in and account creation. */
const EmailAuthForm: React.FC<{
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  isBusy: boolean;
  formError: string | null;
  authError: string | null;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  mode,
  email,
  password,
  confirmPassword,
  isBusy,
  formError,
  authError,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onEmailSubmit,
}) => (
  <div className="account-email-form">
    <div className="account-divider-label">
      <div className="h-px flex-1 bg-border" />
      <span>Email / Password</span>
      <div className="h-px flex-1 bg-border" />
    </div>

    <div className="account-mode-toggle">
      <Button
        variant={mode === "sign_in" ? "default" : "outline"}
        onClick={() => onModeChange("sign_in")}
        disabled={isBusy}
      >
        Sign In
      </Button>
      <Button
        variant={mode === "sign_up" ? "default" : "outline"}
        onClick={() => onModeChange("sign_up")}
        disabled={isBusy}
      >
        Create Account
      </Button>
    </div>

    <form className="account-form-fields" onSubmit={onEmailSubmit}>
      <div className="account-field-group">
        <label
          htmlFor="account-email"
          className="text-sm font-medium text-foreground"
        >
          Email
        </label>
        <Input
          id="account-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="account-field-group">
        <label
          htmlFor="account-password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <Input
          id="account-password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete={
            mode === "sign_in" ? "current-password" : "new-password"
          }
          minLength={6}
          required
        />
      </div>

      {mode === "sign_up" ? (
        <div className="account-field-group">
          <label
            htmlFor="account-confirm-password"
            className="text-sm font-medium text-foreground"
          >
            Confirm Password
          </label>
          <Input
            id="account-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      ) : null}

      {formError || authError ? (
        <div className="account-error-box">{formError ?? authError}</div>
      ) : null}

      <Button type="submit" disabled={isBusy}>
        {isBusy ? (
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Mail className="mr-2 h-4 w-4" />
        )}
        {mode === "sign_in" ? "Sign In with Email" : "Create Account"}
      </Button>
    </form>
  </div>
);

/** Primary signed-out auth card. */
const SignInPrimaryCard: React.FC<{
  isBusy: boolean;
  mode: AuthMode;
  email: string;
  password: string;
  confirmPassword: string;
  formError: string | null;
  authError: string | null;
  onGoogleSignIn: () => void;
  onModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onEmailSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
}> = ({
  isBusy,
  mode,
  email,
  password,
  confirmPassword,
  formError,
  authError,
  onGoogleSignIn,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onEmailSubmit,
}) => (
  <Card className="account-surface-card">
    <SignInCardHeader />
    <CardContent className="account-section-content">
      <Button
        variant="outline"
        className="w-full justify-center"
        onClick={onGoogleSignIn}
        disabled={isBusy}
      >
        <Cloud className="mr-2 h-4 w-4" />
        Continue with Google
      </Button>

      <EmailAuthForm
        mode={mode}
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        isBusy={isBusy}
        formError={formError}
        authError={authError}
        onModeChange={onModeChange}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onConfirmPasswordChange={onConfirmPasswordChange}
        onEmailSubmit={onEmailSubmit}
      />
    </CardContent>
  </Card>
);

/** Single supporting card for signed-out users so the page stays helpful without turning into marketing clutter. */
const SignedOutSupportCard: React.FC = () => (
  <Card className="account-surface-card account-support-card">
    <CardHeader className="account-section-header">
      <CardTitle className="text-2xl">Why keep an account</CardTitle>
      <CardDescription>
        Use hosted identity and saved defaults without changing the local-first
        workflow.
      </CardDescription>
    </CardHeader>
    <CardContent className="account-section-content">
      <ul className="account-support-list">
        <li>Keep your map and app preferences ready across devices.</li>
        <li>Store the forecaster name you want prefilled in discussions.</li>
        <li>
          Use the same account on different machines without changing the local
          workflow.
        </li>
        <li>
          Upgrade later for hosted premium storage without changing what stays
          free.
        </li>
      </ul>
      <p className="account-support-copy">
        Forecasting, discussions, exports, verification, and local history
        remain available with or without an account.
      </p>
      <Button asChild variant="outline" className="w-full">
        <Link to="/pricing">
          <Crown className="mr-2 h-4 w-4" />
          View Pricing
        </Link>
      </Button>
    </CardContent>
  </Card>
);

/** Shared local-only card body used when hosted accounts are disabled. */
const LocalOnlyCard: React.FC = () => (
  <Card className="account-surface-card">
    <CardHeader className="account-section-header">
      <CardTitle className="text-2xl">Local-only mode</CardTitle>
      <CardDescription>
        Hosted accounts are turned off here, but the full local forecasting
        workflow is still ready to go.
      </CardDescription>
    </CardHeader>
    <CardContent className="account-local-only-content">
      <p className="account-support-copy">
        Forecast drawing, discussions, verification, imports, exports, and local
        history keep working exactly as expected.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back to Home</Link>
      </Button>
    </CardContent>
  </Card>
);

/** Signed-out account experience focused on a clean auth flow plus one concise reassurance card. */
const SignedOutAccountView: React.FC = () => {
  const { signInWithEmail, signInWithGoogle, signUpWithEmail, error, status } =
    useAuth();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = submitting || status === "loading";

  useEffect(() => {
    if (mode === "sign_in") {
      setConfirmPassword("");
    }
  }, [mode]);

  /** Handles email/password sign-in or sign-up based on the selected account mode. */
  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (mode === "sign_up" && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "sign_in") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      setPassword("");
      setConfirmPassword("");
    } catch (nextError) {
      setFormError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to complete that request right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Starts the hosted Google sign-in flow. */
  const handleGoogleSignIn = async () => {
    setFormError(null);
    setSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (nextError) {
      setFormError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to start Google sign-in right now.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /** Wraps Google sign-in for button usage without inline promise handling in JSX. */
  const handleGoogleSignInClick = () => {
    handleGoogleSignIn().catch(() => {
      // Form feedback is already handled by handleGoogleSignIn.
    });
  };

  return (
    <div className="account-page-stack">
      <AccountHero description="Sign in to keep your profile and defaults ready across devices. Core forecasting stays free with or without an account." />

      <div className="account-signed-out-grid">
        <div>
          <SignInPrimaryCard
            isBusy={isBusy}
            mode={mode}
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            formError={formError}
            authError={error}
            onGoogleSignIn={handleGoogleSignInClick}
            onModeChange={setMode}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onEmailSubmit={handleEmailSubmit}
          />
        </div>
        <SignedOutSupportCard />
      </div>
    </div>
  );
};

/** Local-only fallback for deployments where hosted accounts are intentionally disabled. */
const DisabledStateView: React.FC = () => (
  <div className="account-page-stack">
    <AccountHero description="This deployment is running in local-only mode. You can still use every core GFC workflow without signing in." />
    <LocalOnlyCard />
  </div>
);

/** Production-facing account page for hosted sign-in, synced defaults, and local-only fallback. */
const AccountPage: React.FC = () => {
  const { hostedAuthEnabled, status } = useAuth();

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
        {!hostedAuthEnabled ? <DisabledStateView /> : null}
        {hostedAuthEnabled && status === "signed_in" ? (
          <SignedInAccountView />
        ) : null}
        {hostedAuthEnabled && status !== "signed_in" ? (
          <SignedOutAccountView />
        ) : null}
      </div>
    </div>
  );
};

export default AccountPage;
export { AccountPage };
