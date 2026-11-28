"use client";
import { useCallback, useEffect, useState } from "react";
import { createTranslator } from "@santa-tracker/localization";
import EmergencySwitches from "./emergency-switches";
import LoginPanel from "./login-panel";
import PasskeySecurity from "./passkey-security";

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

interface LocationsResponse {
  locations?: AdminLocation[];
  error?: string;
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
      <button onClick={() => { void logout(); }} className="bg-gray-700 px-4 py-2 rounded mb-6">Logout</button>
      <div className="flex gap-4 mb-6">
        <a href="/admin/route-simulator" className="bg-blue-600 px-4 py-2 rounded">Route Simulator</a>
        <button onClick={() => { void loadLocations(); }} className="bg-green-600 px-4 py-2 rounded">Refresh Locations ({locations.length})</button>
      </div>
      <PasskeySecurity onSessionEnded={onLogout} />
      <EmergencySwitches />
      {status && <p className="mb-4">{status}</p>}
      <div className="bg-white/5 rounded p-4 overflow-auto max-h-[60vh]">
        <pre className="text-xs">{JSON.stringify(locations.slice(0, 3), null, 2)}</pre>
        {locations.length > 3 && <p>… and {locations.length - 3} more</p>}
      </div>
    </div>
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

  const signedOut = useCallback(() => setIsAuthed(false), []);

  if (isAuthed === null) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">Loading…</div>;
  }
  if (!isAuthed) return <LoginPanel onAuthenticated={() => setIsAuthed(true)} />;
  return <Dashboard onLogout={signedOut} />;
}
