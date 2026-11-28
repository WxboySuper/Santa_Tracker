"use client";

import { useState } from "react";

interface RecoveryCodesProps {
  codes: string[];
  doneLabel: string;
  onDone: () => void;
}

function downloadCodes(codes: string[]) {
  const text = [
    "Santa Tracker admin recovery codes",
    `Created ${new Date().toISOString()}`,
    "Each code works once. Keep them somewhere safe and offline.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "santa-admin-recovery-codes.txt";
  link.click();
  URL.revokeObjectURL(url);
}

/** Shows a fresh set of recovery codes once. The owner has to confirm they saved them before the panel closes. */
export default function RecoveryCodes({ codes, doneLabel, onDone }: RecoveryCodesProps) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="recovery-codes-title" className="mt-4 rounded-lg border border-amber-400/60 bg-amber-950/40 p-4">
      <h3 id="recovery-codes-title" className="text-lg font-semibold">Save your recovery codes</h3>
      <p className="mt-1 text-sm text-white/80">
        These are shown once. Each code signs you in a single time if you lose your passkey. Password sign-in is off once a passkey exists.
      </p>
      <ol className="mt-3 grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
        {codes.map(code => (
          <li key={code} className="rounded bg-black/40 px-2 py-1 text-center select-all">{code}</li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => { void copy(); }} className="rounded bg-gray-700 px-3 py-1.5 text-sm">
          {copied ? "Copied" : "Copy all"}
        </button>
        <button type="button" onClick={() => downloadCodes(codes)} className="rounded bg-gray-700 px-3 py-1.5 text-sm">Download .txt</button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />
        I have stored these codes somewhere safe
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className="mt-3 rounded bg-green-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-40">
        {doneLabel}
      </button>
    </section>
  );
}
