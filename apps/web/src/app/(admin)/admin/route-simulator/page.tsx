"use client";
import { useState } from "react";

export default function RouteSimulatorPage() {
  const [output, setOutput] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function simulate() {
    const token = localStorage.getItem("admin_token");
    if (!token) { setStatus("Not authenticated"); return; }
    const res = await fetch("/api/admin/route/simulate", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setOutput(data);
    setStatus(res.ok ? "Simulated" : data.error);
  }
  async function simulateTrial() {
    const token = localStorage.getItem("admin_token");
    const res = await fetch("/api/admin/route/trial/simulate", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setOutput(data);
    setStatus(res.ok ? "Trial simulated" : data.error);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Route Simulator (TypeScript)</h1>
      <p className="text-white/60 mb-4">Deterministic simulation shared between editor, admin UI, and tests via route-engine package. No Flask.</p>
      <div className="flex gap-4 mb-6">
        <button onClick={simulate} className="bg-blue-600 px-4 py-2 rounded">Simulate Route</button>
        <button onClick={simulateTrial} className="bg-purple-600 px-4 py-2 rounded">Simulate Trial</button>
      </div>
      {status && <p className="mb-4">{status}</p>}
      <pre className="bg-black/40 p-4 rounded text-xs overflow-auto max-h-[70vh]">{output ? JSON.stringify(output, null, 2) : "No output"}</pre>
    </div>
  );
}
