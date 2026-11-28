"use client";

import { useState } from "react";
import { signInWithPasskey, signInWithPassword, signInWithRecoveryCode, type AdminResult } from "@/lib/admin-passkey-client";

type Method = "passkey" | "password" | "recovery";

interface LoginPanelProps {
  onAuthenticated: () => void;
}

function SecretForm({ label, type, busy, onSubmit }: { label: string; type: "password" | "text"; busy: boolean; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="space-y-3"
    >
      <input
        type={type}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={event => setValue(event.target.value)}
        autoComplete={type === "password" ? "current-password" : "one-time-code"}
        className={`w-full rounded bg-white p-2 text-black ${type === "text" ? "font-mono" : ""}`}
      />
      <button type="submit" disabled={busy || !value} className="w-full rounded bg-red-600 px-6 py-2 font-semibold hover:bg-red-700 disabled:opacity-40">
        Sign in
      </button>
    </form>
  );
}

const METHOD_LINKS: { method: Method; label: string }[] = [
  { method: "passkey", label: "Use a passkey" },
  { method: "password", label: "Use the password" },
  { method: "recovery", label: "Use a recovery code" },
];

function OtherMethods({ current, busy, onSwitch }: { current: Method; busy: boolean; onSwitch: (method: Method) => void }) {
  return (
    <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
      {METHOD_LINKS.filter(link => link.method !== current).map(link => (
        <button key={link.method} type="button" disabled={busy} onClick={() => onSwitch(link.method)} className="underline disabled:opacity-40">{link.label}</button>
      ))}
    </div>
  );
}

function MethodForm({ method, busy, attempt }: { method: Method; busy: boolean; attempt: (action: () => Promise<AdminResult<null>>) => void }) {
  if (method === "password") return <SecretForm label="Admin password" type="password" busy={busy} onSubmit={value => attempt(() => signInWithPassword(value))} />;
  if (method === "recovery") return <SecretForm label="Recovery code" type="text" busy={busy} onSubmit={value => attempt(() => signInWithRecoveryCode(value))} />;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => attempt(signInWithPasskey)}
      className="w-full rounded bg-red-600 px-6 py-2 font-semibold hover:bg-red-700 disabled:opacity-40"
    >
      {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
    </button>
  );
}

/** Passkey first; password only until a passkey exists; one recovery code as the way back in. */
export default function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [method, setMethod] = useState<Method>("passkey");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function attempt(action: () => Promise<AdminResult<null>>) {
    const startedWith = method;
    setBusy(true);
    setStatus("");
    const result = await action();
    setBusy(false);
    if (result.ok) {
      onAuthenticated();
      return;
    }
    if (startedWith === "passkey" && result.status === 409) {
      setMethod("password");
      setStatus("No passkey is set up yet. Sign in with the password, then add one.");
      return;
    }
    setStatus(result.error);
  }

  function switchTo(next: Method) {
    setMethod(next);
    setStatus("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-8 text-white">
      <div className="w-full max-w-md rounded-xl bg-white/10 p-8 backdrop-blur-md">
        <h1 className="mb-4 text-2xl font-bold">Admin sign-in</h1>
        <MethodForm method={method} busy={busy} attempt={action => { void attempt(action); }} />
        {status && <p role="alert" className="mt-4 text-sm">{status}</p>}
        <OtherMethods current={method} busy={busy} onSwitch={switchTo} />
      </div>
    </div>
  );
}
