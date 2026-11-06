"use client";
import { useCallback, useEffect, useState } from "react";
import { createTranslator } from "@santa-tracker/localization";

const t = createTranslator().t;

interface AdminLocation {
  id?: number;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  utc_offset?: number | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  country?: string | null;
  population?: number | null;
  priority?: number | null;
  notes?: string | null;
  fun_facts?: string | null;
  stop_duration?: number | null;
  is_stop?: boolean | null;
}

interface LoginResponse {
  token?: string;
  error?: string;
}

interface LocationsResponse {
  locations?: AdminLocation[];
  error?: string;
}

interface FeatureFlagsResponse {
  version: 1;
  hidden: { tracker: boolean; advent: boolean };
  updatedAt: string;
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface LoginPanelProps {
  onAuthenticated: () => void;
}

function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      credentials: "include",
    });
    const data = await parseJson<LoginResponse>(res);
    if (res.ok) {
      onAuthenticated();
      setStatus("Logged in");
      return;
    }
    setStatus(data?.error ?? "Login failed");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-white text-black mb-4"
        />
        <button onClick={() => { void login(); }} className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-semibold w-full">
          Login
        </button>
        {status && <p className="mt-4 text-sm">{status}</p>}
      </div>
    </div>
  );
}

interface DashboardProps {
  onLogout: () => void;
}

function Dashboard({ onLogout }: DashboardProps) {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [status, setStatus] = useState("");

  const loadLocations = useCallback(async () => {
    const res = await fetch("/api/admin/locations", { credentials: "include" });
    const data = await parseJson<LocationsResponse>(res);
    if (res.ok && data?.locations) {
      setLocations(data.locations);
      setStatus("");
      return;
    }
    setStatus(data?.error ?? "");
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore network error, still clear UI
    }
    onLogout();
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
      <p className="text-white/70 mb-4">Authenticated via HttpOnly JWT cookie (server-owned boundary, Bearer also accepted).</p>
      <button onClick={() => { void logout(); }} className="bg-gray-700 px-4 py-2 rounded mb-6">Logout</button>
      <div className="flex gap-4 mb-6">
        <a href="/admin/route-simulator" className="bg-blue-600 px-4 py-2 rounded">Route Simulator</a>
        <button onClick={() => { void loadLocations(); }} className="bg-green-600 px-4 py-2 rounded">Refresh Locations ({locations.length})</button>
      </div>
      <EmergencySwitches />
      {status && <p className="mb-4">{status}</p>}
      <div className="bg-white/5 rounded p-4 overflow-auto max-h-[60vh]">
        <pre className="text-xs">{JSON.stringify(locations.slice(0, 3), null, 2)}</pre>
        {locations.length > 3 && <p>… and {locations.length - 3} more</p>}
      </div>
    </div>
  );
}

function EmergencySwitches() {
  const [flags, setFlags] = useState<FeatureFlagsResponse | null>(null);
  const [pendingFeature, setPendingFeature] = useState<"tracker" | "advent" | null>(null);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadFlags = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/feature-flags", { credentials: "include" });
      const data = await parseJson<FeatureFlagsResponse>(response);
      if (!response.ok || !data) throw new Error("load failed");
      setFlags(data);
      setStatus("");
    } catch {
      setStatus(t("admin.emergency.loadFailed"));
    }
  }, []);

  useEffect(() => { void loadFlags(); }, [loadFlags]);

  async function save(hidden: FeatureFlagsResponse["hidden"]) {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/feature-flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, hidden }),
      });
      const data = await parseJson<FeatureFlagsResponse>(response);
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

  function toggle(feature: "tracker" | "advent", hidden: boolean) {
    if (!flags || isSaving) return;
    if (hidden) {
      setPendingFeature(feature);
      return;
    }
    void save({ ...flags.hidden, [feature]: false });
  }

  return (
    <section aria-labelledby="emergency-switches-title" className="mb-6 rounded-xl border border-red-300/30 bg-red-950/30 p-5">
      <h2 id="emergency-switches-title" className="text-xl font-bold">{t("admin.emergency.title")}</h2>
      <p className="mb-4 mt-1 text-white/70">{t("admin.emergency.description")}</p>
      {!flags ? <p role="status">{status || t("admin.emergency.loading")}</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["tracker", "advent"] as const).map(feature => {
            const label = feature === "tracker" ? t("admin.emergency.hideTracker") : t("admin.emergency.hideAdvent");
            return (
              <label key={feature} className="flex min-h-20 items-center justify-between gap-4 rounded-lg bg-white/5 p-4">
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="text-sm text-white/70">{flags.hidden[feature] ? t("admin.emergency.hidden") : t("admin.emergency.visible")}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={label}
                  checked={flags.hidden[feature]}
                  disabled={isSaving}
                  onChange={event => toggle(feature, event.currentTarget.checked)}
                  className="h-6 w-11 accent-red-500"
                />
              </label>
            );
          })}
        </div>
      )}
      {flags && <p className="mt-4 text-sm text-white/60">{flags.updatedAt ? t("admin.emergency.lastUpdated", { time: new Date(flags.updatedAt).toLocaleString() }) : t("admin.emergency.neverUpdated")}</p>}
      {status && <p className="mt-3" role={status === t("admin.emergency.saveFailed") || status === t("admin.emergency.loadFailed") ? "alert" : "status"} aria-live="polite">{status}</p>}
      {pendingFeature && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="emergency-confirm-title" aria-describedby="emergency-confirm-message" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-800 p-6 shadow-xl">
            <h3 id="emergency-confirm-title" className="text-lg font-bold">{t("admin.emergency.confirmTitle")}</h3>
            <p id="emergency-confirm-message" className="my-3 text-white/80">{t("admin.emergency.confirmMessage")}</p>
            <div className="flex justify-end gap-3">
              <button type="button" autoFocus onClick={() => setPendingFeature(null)} className="rounded bg-gray-600 px-4 py-2">{t("admin.emergency.cancel")}</button>
              <button type="button" disabled={isSaving} onClick={() => { if (flags) void save({ ...flags.hidden, [pendingFeature]: true }); }} className="rounded bg-red-600 px-4 py-2 font-semibold">{t("admin.emergency.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      try {
        const res = await fetch("/api/admin/locations", { credentials: "include" });
        if (!cancelled) setIsAuthed(res.ok);
      } catch {
        if (!cancelled) setIsAuthed(false);
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthed === null) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">Loading…</div>;
  }
  if (!isAuthed) return <LoginPanel onAuthenticated={() => setIsAuthed(true)} />;
  return <Dashboard onLogout={() => setIsAuthed(false)} />;
}
