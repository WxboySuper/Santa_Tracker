"use client";

import { useCallback, useEffect, useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  confirmRecoverySession,
  loadPasskeys,
  needsSecondRecoveryCode,
  registerPasskey,
  removePasskey,
  replaceRecoveryCodes,
  type AdminResult,
  type PasskeySummary,
} from "@/lib/admin-passkey-client";
import RecoveryCodes from "./recovery-codes";

const TRANSPORT_LABELS: Record<string, string> = {
  internal: "this device",
  hybrid: "phone",
  usb: "security key (USB)",
  nfc: "security key (NFC)",
  ble: "Bluetooth",
};

function describe(transports: string[]): string {
  const labels = transports.map(t => TRANSPORT_LABELS[t] ?? t);
  return labels.length ? labels.join(", ") : "passkey";
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function SecondCodeForm({ onConfirmed }: { onConfirmed: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await confirmRecoverySession(code);
    if (result.ok) onConfirmed();
    else setError(result.error);
  }

  return (
    <form onSubmit={event => { void submit(event); }} className="mt-3 rounded-lg bg-white/5 p-3 text-sm">
      <p>You signed in with a recovery code. Enter a second unused code to change passkeys.</p>
      <div className="mt-2 flex gap-2">
        <input value={code} onChange={event => setCode(event.target.value)} aria-label="Second recovery code" autoComplete="one-time-code" className="flex-1 rounded bg-white p-1.5 font-mono text-black" />
        <button type="submit" disabled={!code.trim()} className="rounded bg-blue-600 px-3 py-1.5 disabled:opacity-40">Confirm</button>
      </div>
      {error && <p role="alert" className="mt-2 text-red-300">{error}</p>}
    </form>
  );
}

function PasskeyList({ summary, busy, onRemove }: { summary: PasskeySummary; busy: boolean; onRemove: (id: string) => void }) {
  if (!summary.passkeys.length) {
    return <p className="text-sm text-amber-200">No passkey yet. Password sign-in stays on until you add one.</p>;
  }
  const lastOne = summary.passkeys.length === 1;
  return (
    <ul className="space-y-2 text-sm">
      {summary.passkeys.map(passkey => (
        <li key={passkey.id} className="flex items-center justify-between gap-3 rounded bg-white/5 px-3 py-2">
          <span>
            <span className="font-mono">{shortId(passkey.id)}</span>
            <span className="text-white/60"> · {describe(passkey.transports)}</span>
          </span>
          <button
            type="button"
            disabled={busy || lastOne}
            title={lastOne ? "Add another passkey before removing this one" : undefined}
            onClick={() => onRemove(passkey.id)}
            className="rounded bg-gray-700 px-2 py-1 disabled:opacity-40"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

interface OverviewProps {
  summary: PasskeySummary | null;
  busy: boolean;
  supported: boolean;
  onAdd: () => void;
  onRotate: () => void;
  onRemove: (id: string) => void;
}

function RecoveryCount({ remaining }: { remaining: number }) {
  return (
    <p className="mt-2 text-sm text-white/70">
      Recovery codes left: <strong>{remaining}</strong>
      {remaining < 3 && <span className="text-amber-200"> (running low; replace them)</span>}
    </p>
  );
}

/** The passkey list, recovery-code count and actions, once the list has loaded. */
function Overview({ summary, busy, supported, onAdd, onRotate, onRemove }: OverviewProps) {
  if (!summary) return <p className="text-sm text-white/60">Loading passkeys…</p>;
  const hasPasskey = summary.passkeys.length > 0;
  return (
    <>
      <PasskeyList summary={summary} busy={busy} onRemove={onRemove} />
      {hasPasskey && <RecoveryCount remaining={summary.recoveryCodesRemaining} />}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !supported} onClick={onAdd} className="rounded bg-red-600 px-4 py-1.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-40">
          {hasPasskey ? "Add another passkey" : "Set up a passkey"}
        </button>
        {hasPasskey && (
          <button type="button" disabled={busy} onClick={onRotate} className="rounded bg-gray-700 px-4 py-1.5 text-sm disabled:opacity-40">
            Replace recovery codes
          </button>
        )}
      </div>
    </>
  );
}

type Outcome<T> = { message: (value: T) => string; refreshAfter?: (value: T) => boolean };

/** Everything the panel tracks: the loaded list, the last message, and the one-time codes being shown. */
function usePasskeyPanel(onSessionEnded: () => void) {
  const [summary, setSummary] = useState<PasskeySummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [needsSecondCode, setNeedsSecondCode] = useState(false);
  // The first passkey turns password sign-in off and ends password sessions, including this one.
  const [mustSignInAgain, setMustSignInAgain] = useState(false);

  const refresh = useCallback(async () => {
    const result = await loadPasskeys();
    if (result.ok) setSummary(result.value);
    else if (result.status === 401) onSessionEnded();
    else setMessage(result.error);
  }, [onSessionEnded]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run<T>(action: () => Promise<AdminResult<T>>, outcome: Outcome<T>) {
    setBusy(true);
    setMessage("");
    const result = await action();
    setBusy(false);
    if (needsSecondRecoveryCode(result)) {
      setNeedsSecondCode(true);
      return;
    }
    setMessage(result.ok ? outcome.message(result.value) : result.error);
    const again = result.ok ? (outcome.refreshAfter?.(result.value) ?? true) : true;
    if (again) await refresh();
  }

  return { summary, message, setMessage, busy, codes, setCodes, needsSecondCode, setNeedsSecondCode, mustSignInAgain, setMustSignInAgain, run };
}

type Panel = ReturnType<typeof usePasskeyPanel>;

// Only the first registration returns recovery codes, so the server's answer, not the loaded list, says which one this was.
function addPasskey(panel: Panel) {
  const isFirst = (value: { recoveryCodes: string[] }) => value.recoveryCodes.length > 0;
  void panel.run(registerPasskey, {
    message: value => {
      if (!isFirst(value)) return "Passkey added.";
      panel.setCodes(value.recoveryCodes);
      panel.setMustSignInAgain(true);
      return "Passkey added. Save your recovery codes, then sign in again with the passkey.";
    },
    refreshAfter: value => !isFirst(value),
  });
}

function removeOne(panel: Panel, id: string) {
  if (!window.confirm("Remove this passkey? It will no longer sign in to the admin.")) return;
  void panel.run(() => removePasskey(id), { message: () => "Passkey removed." });
}

function rotateCodes(panel: Panel) {
  if (!window.confirm("Replace all recovery codes? The old codes stop working immediately.")) return;
  void panel.run(replaceRecoveryCodes, {
    message: value => {
      panel.setCodes(value.recoveryCodes);
      return "New recovery codes created.";
    },
  });
}

function useWebAuthnSupport(): boolean {
  // Checked after mount so the server render and the first client render agree.
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  return supported;
}

/** Passkeys and recovery codes for the admin account (#549). */
export default function PasskeySecurity({ onSessionEnded }: { onSessionEnded: () => void }) {
  const panel = usePasskeyPanel(onSessionEnded);
  const supported = useWebAuthnSupport();
  const reSignIn = panel.mustSignInAgain;
  return (
    <section aria-labelledby="security-title" className="mb-6 rounded-xl bg-white/5 p-4">
      <h2 id="security-title" className="mb-2 text-xl font-semibold">Sign-in security</h2>
      {!supported && <p role="alert" className="mb-2 text-sm text-red-300">This browser does not support passkeys.</p>}
      {!reSignIn && (
        <Overview
          summary={panel.summary}
          busy={panel.busy}
          supported={supported}
          onAdd={() => addPasskey(panel)}
          onRotate={() => rotateCodes(panel)}
          onRemove={id => removeOne(panel, id)}
        />
      )}
      {panel.message && <p role="status" className="mt-2 text-sm">{panel.message}</p>}
      {panel.needsSecondCode && <SecondCodeForm onConfirmed={() => { panel.setNeedsSecondCode(false); panel.setMessage("Confirmed. Try that again."); }} />}
      {panel.codes && <RecoveryCodes codes={panel.codes} doneLabel={reSignIn ? "Done, sign in again" : "Done"} onDone={reSignIn ? onSessionEnded : () => panel.setCodes(null)} />}
    </section>
  );
}
