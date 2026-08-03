// skipcq: JS-W1028
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBuildTarget } from '../config/buildTarget';
import {
  isFeatureExposureDiagnosticsEnabled,
  resolveAllFeatureExposureDiagnostics,
  type FeatureExposureDiagnostic,
} from '../config/featureExposureDiagnostics';
import {
  fetchServerCapabilityStatus,
  type ServerCapabilityStatusResponse,
} from '../config/serverCapabilityStatus';

/** Renders boolean diagnostic values as yes/no for the maintainer table. */
function formatBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

/** Loads live server capability status for local diagnostics. */
function useServerCapabilityStatus() {
  const [serverStatus, setServerStatus] = useState<ServerCapabilityStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchServerCapabilityStatus()
      .then((response) => {
        if (active) {
          setServerStatus(response);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : 'Unable to load server capability status.'
          );
          setServerStatus({ capabilities: {} });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { serverStatus, error };
}

/** Shown when diagnostics are disabled outside local development builds. */
function DiagnosticsUnavailableNotice() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Feature exposure diagnostics</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is only available during local development builds.
      </p>
      <Link className="mt-4 inline-block text-sm underline" to="/">
        Back to home
      </Link>
    </div>
  );
}

/** Page header with build target context and navigation back to home. */
function DiagnosticsPageHeader({ buildTarget }: { buildTarget: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">Feature exposure diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Build target: <strong>{buildTarget}</strong>
        </p>
      </div>
      <Link className="text-sm underline" to="/">
        Back to home
      </Link>
    </div>
  );
}

/** Warns when live server capability status could not be loaded. */
function ServerStatusError({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      Server capability status unavailable: {message}
    </p>
  );
}

/** Renders the server capability column for one diagnostic row. */
function formatServerCapability(diagnostic: FeatureExposureDiagnostic): string {
  if (!diagnostic.serverCapability) {
    return '—';
  }

  return `${diagnostic.serverCapability.serverReason} (agrees=${formatBoolean(
    diagnostic.serverCapability.agreesWithClient
  )})`;
}

/** Renders one feature row in the diagnostics table. */
function DiagnosticRow({ diagnostic }: { diagnostic: FeatureExposureDiagnostic }) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-mono text-xs">{diagnostic.featureKey}</td>
      <td className="px-3 py-2">{diagnostic.lifecycle}</td>
      <td className="px-3 py-2">{formatBoolean(diagnostic.registryExposed)}</td>
      <td className="px-3 py-2">{formatBoolean(diagnostic.resolvedExposed)}</td>
      <td className="px-3 py-2 font-mono text-xs">{diagnostic.reason}</td>
      <td className="px-3 py-2 font-mono text-xs">{formatServerCapability(diagnostic)}</td>
      <td className="px-3 py-2 text-xs">{diagnostic.owner ?? '—'}</td>
      <td className="px-3 py-2 text-xs">{diagnostic.removalCondition ?? '—'}</td>
    </tr>
  );
}

/** Column headings for the diagnostics table. */
function DiagnosticsTableHead() {
  return (
    <thead className="bg-muted/50">
      <tr>
        <th className="px-3 py-2 font-medium">Feature</th>
        <th className="px-3 py-2 font-medium">Lifecycle</th>
        <th className="px-3 py-2 font-medium">Registry</th>
        <th className="px-3 py-2 font-medium">Resolved</th>
        <th className="px-3 py-2 font-medium">Reason</th>
        <th className="px-3 py-2 font-medium">Server</th>
        <th className="px-3 py-2 font-medium">Owner</th>
        <th className="px-3 py-2 font-medium">Removal</th>
      </tr>
    </thead>
  );
}

/** Tabular view of resolved feature exposure diagnostics. */
function DiagnosticsTable({ diagnostics }: { diagnostics: FeatureExposureDiagnostic[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="min-w-full text-left text-sm">
        <DiagnosticsTableHead />
        <tbody>
          {diagnostics.map((diagnostic) => (
            <DiagnosticRow key={diagnostic.featureKey} diagnostic={diagnostic} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders loading state or the diagnostics table. */
function DiagnosticsContent({
  diagnostics,
}: {
  diagnostics: FeatureExposureDiagnostic[] | null;
}) {
  if (!diagnostics) {
    return <p className="text-sm text-muted-foreground">Loading diagnostics…</p>;
  }

  return <DiagnosticsTable diagnostics={diagnostics} />;
}

/** Local-only maintainer page listing resolved feature exposure diagnostics. */
export function FeatureExposureDiagnosticsPage() {
  const buildTarget = getBuildTarget();
  const { serverStatus, error } = useServerCapabilityStatus();

  const diagnostics = useMemo<FeatureExposureDiagnostic[] | null>(() => {
    if (!serverStatus) {
      return null;
    }

    return resolveAllFeatureExposureDiagnostics({
      buildTarget,
      includeInternalMetadata: true,
      serverStatus: {
        loaded: true,
        capabilities: serverStatus.capabilities,
      },
    });
  }, [buildTarget, serverStatus]);

  if (!isFeatureExposureDiagnosticsEnabled()) {
    return <DiagnosticsUnavailableNotice />;
  }

  return (
    <div className="p-6">
      <DiagnosticsPageHeader buildTarget={buildTarget} />
      {error ? <ServerStatusError message={error} /> : null}
      <DiagnosticsContent diagnostics={diagnostics} />
    </div>
  );
}

export default FeatureExposureDiagnosticsPage;
