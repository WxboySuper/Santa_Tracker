"use client";
import { useState, useEffect } from "react";

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [locations, setLocations] = useState<any[]>([]);

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) setToken(t);
  }, []);

  async function login() {
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("admin_token", data.token);
      document.cookie = `admin_token=${data.token}; Path=/; SameSite=Lax`;
      setToken(data.token);
      setStatus("Logged in");
    } else setStatus(data.error || "Login failed");
  }

  async function loadLocations() {
    if (!token) return;
    const res = await fetch("/api/admin/locations", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (res.ok) setLocations(data.locations);
    else setStatus(data.error);
  }

  // The loader also powers the refresh button, so keep it stable outside the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) loadLocations(); }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
          <input type="password" placeholder="Admin password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 rounded bg-white text-black mb-4" />
          <button onClick={login} className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-semibold w-full">Login</button>
          {status && <p className="mt-4 text-sm">{status}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Admin Dashboard</h1>
      <p className="text-white/70 mb-4">Authenticated via JWT (no password fallback). Token stored in localStorage + cookie for middleware.</p>
      <button onClick={()=>{localStorage.removeItem("admin_token"); document.cookie="admin_token=; Max-Age=0; Path=/"; setToken(null);}} className="bg-gray-700 px-4 py-2 rounded mb-6">Logout</button>
      <div className="flex gap-4 mb-6">
        <a href="/admin/route-simulator" className="bg-blue-600 px-4 py-2 rounded">Route Simulator</a>
        <button onClick={loadLocations} className="bg-green-600 px-4 py-2 rounded">Refresh Locations ({locations.length})</button>
      </div>
      {status && <p className="mb-4">{status}</p>}
      <div className="bg-white/5 rounded p-4 overflow-auto max-h-[60vh]">
        <pre className="text-xs">{JSON.stringify(locations.slice(0,3), null, 2)}</pre>
        {locations.length>3 && <p>… and {locations.length-3} more</p>}
      </div>
    </div>
  );
}
