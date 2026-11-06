"use client";

import { useCallback, useEffect, useState } from "react";
import { createTranslator, type MessageKey } from "@santa-tracker/localization";
import type { SeasonFeature } from "@/lib/season";

const t = createTranslator().t;
type HiddenFeatures = Record<SeasonFeature, boolean>;

interface FeatureFlagsResponse {
  version: 1;
  hidden: HiddenFeatures;
  updatedAt: string;
}

const LABEL_KEYS: Record<SeasonFeature, MessageKey> = {
  tracker: "admin.emergency.hideTracker",
  advent: "admin.emergency.hideAdvent",
};

async function readFlagsResponse(response: Response): Promise<FeatureFlagsResponse | null> {
  try {
    return (await response.json()) as FeatureFlagsResponse;
  } catch {
    return null;
  }
}

function useEmergencyFlags() {
  const [flags, setFlags] = useState<FeatureFlagsResponse | null>(null);
  const [pendingFeature, setPendingFeature] = useState<SeasonFeature | null>(null);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadFlags = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/feature-flags", { credentials: "include" });
      const data = await readFlagsResponse(response);
      if (!response.ok || !data) throw new Error("load failed");
      setFlags(data);
      setStatus("");
    } catch {
      setStatus(t("admin.emergency.loadFailed"));
    }
  }, []);

  useEffect(() => { void loadFlags(); }, [loadFlags]);

  async function save(hidden: HiddenFeatures) {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, hidden }),
      });
      const data = await readFlagsResponse(response);
      if (!response.ok || !data) throw new Error("save failed");
      setFlags(data);
      setStatus(t("admin.emergency.saved"));
    } catch {
      setStatus(t("admin.emergency.saveFailed"));
    } finally {
      setIsSaving(false);
      setPendingFeature(null);
    }
  }

  function toggle(feature: SeasonFeature, hidden: boolean) {
    if (!flags || isSaving) return;
    if (hidden) {
      setPendingFeature(feature);
      return;
    }
    void save({ ...flags.hidden, [feature]: false });
  }

  function confirmHide() {
    if (!flags || !pendingFeature) return;
    void save({ ...flags.hidden, [pendingFeature]: true });
  }

  return { flags, pendingFeature, status, isSaving, toggle, confirmHide, cancelHide: () => setPendingFeature(null) };
}

function FeatureToggle({ feature, hidden, disabled, onChange }: {
  feature: SeasonFeature;
  hidden: boolean;
  disabled: boolean;
  onChange: (feature: SeasonFeature, hidden: boolean) => void;
}) {
  const label = t(LABEL_KEYS[feature]);
  const state = hidden ? t("admin.emergency.hidden") : t("admin.emergency.visible");
  return (
    <label className="flex min-h-20 items-center justify-between gap-4 rounded-lg bg-white/5 p-4">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-sm text-white/70">{state}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={hidden}
        disabled={disabled}
        onChange={event => onChange(feature, event.currentTarget.checked)}
        className="h-6 w-11 accent-red-500"
      />
    </label>
  );
}

function ConfirmHideDialog({ feature, disabled, onCancel, onConfirm }: {
  feature: SeasonFeature;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = feature === "tracker" ? "tracker" : "Advent";
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="emergency-confirm-title" aria-describedby="emergency-confirm-message" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-xl">
        <h3 id="emergency-confirm-title" className="text-lg font-bold">{t("admin.emergency.confirmTitle", { feature: title })}</h3>
        <p id="emergency-confirm-message" className="my-3 text-white/80">{t("admin.emergency.confirmMessage")}</p>
        <div className="flex justify-end gap-3">
          <button type="button" autoFocus onClick={onCancel} className="rounded bg-gray-600 px-4 py-2">{t("admin.emergency.cancel")}</button>
          <button type="button" disabled={disabled} onClick={onConfirm} className="rounded bg-red-600 px-4 py-2 font-semibold">{t("admin.emergency.confirm")}</button>
        </div>
      </div>
    </div>
  );
}

export default function EmergencySwitches() {
  const model = useEmergencyFlags();
  const failed = model.status === t("admin.emergency.saveFailed") || model.status === t("admin.emergency.loadFailed");
  return (
    <section aria-labelledby="emergency-switches-title" className="mb-6 rounded-xl border border-red-300/30 bg-red-950/30 p-5">
      <h2 id="emergency-switches-title" className="text-xl font-bold">{t("admin.emergency.title")}</h2>
      <p className="mb-4 mt-1 text-white/70">{t("admin.emergency.description")}</p>
      {!model.flags ? <p role="status">{model.status || t("admin.emergency.loading")}</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["tracker", "advent"] as const).map(feature => (
            <FeatureToggle key={feature} feature={feature} hidden={model.flags?.hidden[feature] ?? false} disabled={model.isSaving} onChange={model.toggle} />
          ))}
        </div>
      )}
      {model.flags && <p className="mt-4 text-sm text-white/60">{model.flags.updatedAt ? t("admin.emergency.lastUpdated", { time: new Date(model.flags.updatedAt).toLocaleString() }) : t("admin.emergency.neverUpdated")}</p>}
      {model.status && <p className="mt-3" role={failed ? "alert" : "status"} aria-live="polite">{model.status}</p>}
      {model.pendingFeature && <ConfirmHideDialog feature={model.pendingFeature} disabled={model.isSaving} onCancel={model.cancelHide} onConfirm={model.confirmHide} />}
    </section>
  );
}
