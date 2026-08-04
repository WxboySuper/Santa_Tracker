import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';
import BetaAuthCard from '../components/Beta/BetaAuthCard';
import { BetaHero, BetaInfoCard, BetaPageShell } from '../components/Beta/BetaPageLayout';
import { Button } from '../components/ui/button';
import { useAuth } from '../auth/AuthProvider';
import { getBetaInvitePath, isBetaModeEnabled } from '../lib/betaAccess';
import './BetaAccess.css';

/** True when the invite-path segment is valid for the current beta deployment. */
const hasValidInvitePath = (value: string | undefined): boolean =>
  !getBetaInvitePath() || value === getBetaInvitePath();

/** Invalid invite card shown when the onboarding url is incomplete or wrong. */
const InvalidInviteCard: React.FC = () => (
  <BetaInfoCard
    title="Invite required"
    description="This onboarding URL is incomplete or invalid. Please use the private invite link shared in the beta Discord."
  >
    <Button asChild variant="outline">
      <Link to="/beta">Back to Beta Sign In</Link>
    </Button>
  </BetaInfoCard>
);

/** Fallback state shown when the deployment is missing hosted-auth configuration. */
const BetaInviteDisabledCard: React.FC = () => (
  <BetaInfoCard
    title="Hosted accounts are unavailable"
    description="This beta deployment is missing hosted account configuration, so invite onboarding cannot run right now."
  >
    <Button asChild variant="outline">
      <Link to="/beta">Back to Beta Sign In</Link>
    </Button>
  </BetaInfoCard>
);

/** Already-activated state for a signed-in account that already has beta access. */
const BetaAlreadyActiveCard: React.FC<{ email: string }> = ({ email }) => (
  <BetaInfoCard
    title={
      <span className="flex items-center gap-2 text-2xl">
        <CheckCircle2 className="h-5 w-5" />
        Beta access already active
      </span>
    }
    description={`${email} already has beta access. You can go straight into the beta app now.`}
  >
    <Button asChild>
      <Link to="/">Enter Beta</Link>
    </Button>
  </BetaInfoCard>
);

/** Activation card for a signed-in account that still needs beta access claimed. */
const BetaClaimCard: React.FC<{
  email: string;
  claiming: boolean;
  claimError: string | null;
  onClaim: () => void;
}> = ({ email, claiming, claimError, onClaim }) => (
  <BetaInfoCard
    title={
      <span className="flex items-center gap-2 text-2xl">
        <KeyRound className="h-5 w-5" />
        Activate access for this account
      </span>
    }
    description={`Signed in as ${email}. Activate this invite to allow that account into the beta deployment.`}
  >
    <div className="beta-status-box">
      <strong>Account ready</strong>
      <span>Once activated, this account can sign in on the beta landing page without using the invite again.</span>
    </div>
    {claimError ? <p className="beta-inline-error">{claimError}</p> : null}
    <div className="beta-cta-row">
      <Button onClick={onClaim} disabled={claiming}>
        {claiming ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
        Activate Beta Access
      </Button>
      <Button asChild variant="outline">
        <Link to="/beta">Back to Beta Sign In</Link>
      </Button>
    </div>
  </BetaInfoCard>
);

/** Beta onboarding page reached from the private Discord invite link. */
const BetaInvitePage: React.FC = () => {
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, refreshBetaAccess, status, user } = useAuth();
  const navigate = useNavigate();
  const { invitePath } = useParams();
  const [searchParams] = useSearchParams();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const inviteToken = searchParams.get('t')?.trim() ?? '';
  const inviteLooksValid = useMemo(
    () => Boolean(inviteToken) && hasValidInvitePath(invitePath),
    [invitePath, inviteToken]
  );

  if (!isBetaModeEnabled()) {
    return <Navigate to="/" replace />;
  }

  /** Claims beta access for the current signed-in account via the private server endpoint. */
  const handleClaimAccess = async () => {
    if (!user || !inviteLooksValid) {
      return;
    }

    setClaimError(null);
    setClaiming(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/beta/claim', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: inviteToken,
          invitePath: invitePath ?? '',
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Unable to activate beta access right now.');
      }

      await refreshBetaAccess();
      navigate('/', { replace: true });
    } catch (nextError) {
      setClaimError(nextError instanceof Error ? nextError.message : 'Unable to activate beta access right now.');
    } finally {
      setClaiming(false);
    }
  };

  /** Wraps the async beta-claim action for button usage. */
  const handleClaimAccessClick = () => {
    handleClaimAccess().catch(() => {
      // Claim feedback is already surfaced by handleClaimAccess.
    });
  };

  return (
    <BetaPageShell>
      <BetaHero
        icon={<LockKeyhole className="h-4 w-4" />}
        pillLabel="Beta Invite"
        title="Activate your beta account"
        description="This invite is the one-time onboarding step for the closed beta. Sign in or create the account you want to use, then activate access for that account."
      >
        {!hostedAuthEnabled ? (
          <BetaInviteDisabledCard />
        ) : !inviteLooksValid ? (
          <InvalidInviteCard />
        ) : status !== 'signed_in' ? (
          <BetaAuthCard
            title="Sign in or create your beta account"
            description="Use the account you want to keep for the beta. After sign-in, this invite will activate access on that account."
            allowSignUp
            googleLabel="Continue with Google"
          />
        ) : betaAccessLoading ? (
          <BetaInfoCard
            title="Checking current access"
            description="Making sure this account still needs beta activation before we continue."
          />
        ) : betaAccess ? (
          <BetaAlreadyActiveCard email={user?.email ?? 'This account'} />
        ) : (
          <BetaClaimCard
            email={user?.email ?? 'this account'}
            claiming={claiming}
            claimError={claimError}
            onClaim={handleClaimAccessClick}
          />
        )}
      </BetaHero>
    </BetaPageShell>
  );
};

export default BetaInvitePage;
