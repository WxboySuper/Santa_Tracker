"use client";
import { useCallback, useEffect, useState } from "react";

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

const TOKEN_KEY = "admin_token";

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `admin_token=${token}; Path=/; SameSite=Lax`;
}

function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = "admin_token=; Max-Age=0; Path=/";
}

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface LoginPanelProps {
  onAuthenticated: (token: string) => void;
}

function LoginPanel({ onAuthenticated }: LoginPanelProps) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await parseJson<LoginResponse>(res);
    if (res.ok && data?.token) {
      storeToken(data.token);
      onAuthenticated(data.token);
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
  token: string;
  onLogout: () => void;
}

function Dashboard({ token, onLogout }: DashboardProps) {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [status, setStatus] = useState("");

  const loadLocations = useCallback(async () => {
    const res = await fetch("/api/admin/locations", { headers: { Authorization: `Bearer ${token}` } });
    const data = await parseJson<LocationsResponse>(res);
    if (res.ok && data?.locations) {
      setLocations(data.locations);
      setStatus("");
      return;
    }
    setStatus(data?.error ?? "");
  }, [token]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
      <p className="text-white/70 mb-4">Authenticated via JWT (no password fallback). Token stored in localStorage + cookie for middleware.</p>
      <button onClick={onLogout} className="bg-gray-700 px-4 py-2 rounded mb-6">Logout</button>
      <div className="flex gap-4 mb-6">
        <a href="/admin/route-simulator" className="bg-blue-600 px-4 py-2 rounded">Route Simulator</a>
        <button onClick={() => { void loadLocations(); }} className="bg-green-600 px-4 py-2 rounded">Refresh Locations ({locations.length})</button>
      </div>
      {status && <p className="mb-4">{status}</p>}
      <div className="bg-white/5 rounded p-4 overflow-auto max-h-[60vh]">
        <pre className="text-xs">{JSON.stringify(locations.slice(0, 3), null, 2)}</pre>
        {locations.length > 3 && <p>… and {locations.length - 3} more</p>}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredToken();
    if (stored) setToken(stored);
  }, []);

  function logout() {
    clearStoredToken();
    setToken(null);
  }

  if (!token) return <LoginPanel onAuthenticated={setToken} />;
  return <Dashboard token={token} onLogout={logout} />;
}
