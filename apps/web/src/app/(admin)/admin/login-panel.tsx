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

/** Passkey first; password only until a passkey exists; one recovery code as the way back in. */
export default function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [method, setMethod] = useState<Method>("passkey");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function attempt(action: () => Promise<AdminResult<null>>) {
    setBusy(true);
    setStatus("");
    const result = await action();
    setBusy(false);
    if (result.ok) {
      onAuthenticated();
      return;
    }
    if (method === "passkey" && result.status === 409) {
      setMethod("password");
      setStatus("No passkey is set up yet. Sign in with the password, then add one.");
      return;
    }
    setStatus(result.error);
  }

  const switchTo = (next: Method) => () => {
    setMethod(next);
    setStatus("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-8 text-white">
      <div className="w-full max-w-md rounded-xl bg-white/10 p-8 backdrop-blur-md">
        <h1 className="mb-4 text-2xl font-bold">Admin sign-in</h1>
        {method === "passkey" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => { void attempt(signInWithPasskey); }}
            className="w-full rounded bg-red-600 px-6 py-2 font-semibold hover:bg-red-700 disabled:opacity-40"
          >
            {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
          </button>
        )}
        {method === "password" && <SecretForm label="Admin password" type="password" busy={busy} onSubmit={value => { void attempt(() => signInWithPassword(value)); }} />}
        {method === "recovery" && <SecretForm label="Recovery code" type="text" busy={busy} onSubmit={value => { void attempt(() => signInWithRecoveryCode(value)); }} />}
        {status && <p role="alert" className="mt-4 text-sm">{status}</p>}
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
          {method !== "passkey" && <button type="button" onClick={switchTo("passkey")} className="underline">Use a passkey</button>}
          {method !== "password" && <button type="button" onClick={switchTo("password")} className="underline">Use the password</button>}
          {method !== "recovery" && <button type="button" onClick={switchTo("recovery")} className="underline">Use a recovery code</button>}
        </div>
      </div>
    </div>
  );
}
