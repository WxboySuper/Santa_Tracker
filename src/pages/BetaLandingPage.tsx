import React from 'react';
import { Navigate } from 'react-router';
import { Lock, LogOut } from 'lucide-react';
import BetaAuthCard from '../components/Beta/BetaAuthCard';
import { BetaHero, BetaInfoCard, BetaPageShell, BetaStatusPanel } from '../components/Beta/BetaPageLayout';
import { Button } from '../components/ui/button';
import { useAuth } from '../auth/AuthProvider';
import { isBetaModeEnabled } from '../lib/betaAccess';
import './BetaAccess.css';

type BetaLandingView = 'checking' | 'redirect_home' | 'signed_in_locked' | 'signed_out';

/** Returns the current top-level state for the locked beta landing page. */
const getBetaLandingView = (opts: {
  hostedAuthEnabled: boolean;
  status: ReturnType<typeof useAuth>['status'];
  betaAccess: boolean;
  betaAccessLoading: boolean;
}): BetaLandingView => {
  if (opts.hostedAuthEnabled && opts.status === 'signed_in') {
    if (opts.betaAccessLoading) {
      return 'checking';
    }

    return opts.betaAccess ? 'redirect_home' : 'signed_in_locked';
  }

  return 'signed_out';
};

/** Enrollment help card shown for signed-in accounts without beta access yet. */
const BetaEnrollmentCard: React.FC<{
  email: string;
  onSignOut: () => void;
}> = ({ email, onSignOut }) => (
  <BetaInfoCard
    title="This account is not enrolled yet"
    description={`Signed in as ${email}, but beta access has not been activated.`}
  >
    <div className="beta-status-box">
      <strong>Need access?</strong>
      <span>Open the private beta invite link from Discord while signed into the account you want to use.</span>
    </div>
    <div className="beta-cta-row">
      <Button variant="outline" onClick={onSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  </BetaInfoCard>
);

/** Lower supporting notes on the locked beta landing page. */
const BetaLandingNotes: React.FC = () => (
  <div className="beta-info-grid">
    <BetaInfoCard title={<span className="text-2xl">Access notes</span>} description="How the locked beta works.">
      <ul>
        <li>Use the private invite link once to activate the account you want to keep using.</li>
        <li>After activation, normal sign-in here is enough. The invite link is not needed again.</li>
        <li>Premium access is being granted manually during beta for cloud and subscription testing.</li>
      </ul>
    </BetaInfoCard>

    <BetaInfoCard title={<span className="text-2xl">Need help?</span>} description="Quick reminders before you make another account.">
      <p className="beta-note">
        If the wrong account was activated, sign out first and reopen the invite link. If you need another
        invite, ask in the beta Discord channel instead of creating duplicates.
      </p>
    </BetaInfoCard>
  </div>
);

/** Public landing page shown when the locked beta deployment blocks app access. */
const BetaLandingPage: React.FC = () => {
  const { betaAccess, betaAccessLoading, hostedAuthEnabled, signOutUser, status, user } = useAuth();
  const landingView = getBetaLandingView({ hostedAuthEnabled, status, betaAccess, betaAccessLoading });

  if (!isBetaModeEnabled()) {
    return <Navigate to="/" replace />;
  }

  if (landingView === 'checking') {
    return (
      <BetaStatusPanel
        title="Checking beta access"
        description="Verifying whether this account is enrolled in the closed beta."
      />
    );
  }

  if (landingView === 'redirect_home') {
    return <Navigate to="/" replace />;
  }

  /** Signs the current user out from the locked beta landing page. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {
      // Shared auth state surfaces sign-out failures.
    });
  };

  return (
    <BetaPageShell>
      <BetaHero
        icon={<Lock className="h-4 w-4" />}
        pillLabel="Closed Beta"
        title="Closed beta sign-in"
        description="Beta access is limited to invited accounts. Sign in here if your account has already been activated, or use the private onboarding link from Discord first."
      >
        {landingView === 'signed_in_locked' ? (
          <BetaEnrollmentCard email={user?.email ?? 'this account'} onSignOut={handleSignOutClick} />
        ) : (
          <BetaAuthCard
            title="Tester sign in"
            description="Sign in with the account that already has beta access. New testers should use the private invite link first."
            googleLabel="Sign In with Google"
          />
        )}
      </BetaHero>

      <BetaLandingNotes />
    </BetaPageShell>
  );
};

export default BetaLandingPage;
