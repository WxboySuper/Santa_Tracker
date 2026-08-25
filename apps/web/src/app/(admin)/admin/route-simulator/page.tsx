"use client";
import { useState } from "react";

interface SimulationResponse {
  error?: string;
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin_token");
}

async function runSimulation(url: string, successLabel: string, setStatus: (value: string) => void): Promise<SimulationResponse | null> {
  const token = readToken();
  if (!token) {
    setStatus("Not authenticated");
    return null;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  let data: SimulationResponse | null = null;
  try {
    data = (await res.json()) as SimulationResponse;
  } catch {
    setStatus("Invalid response");
    return null;
  }
  setStatus(res.ok ? successLabel : data.error ?? "");
  return data;
}

export default function RouteSimulatorPage() {
  const [output, setOutput] = useState<SimulationResponse | null>(null);
  const [status, setStatus] = useState("");

  async function simulate(url: string, successLabel: string) {
    const data = await runSimulation(url, successLabel, setStatus);
    if (data) setOutput(data);
  }

  const simulateMain = () => { void simulate("/api/admin/route/simulate", "Simulated"); };
  const simulateTrial = () => { void simulate("/api/admin/route/trial/simulate", "Trial simulated"); };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Route Simulator (TypeScript)</h1>
      <p className="text-white/60 mb-4">Deterministic simulation shared between editor, admin UI, and tests via route-engine package. No Flask.</p>
      <div className="flex gap-4 mb-6">
        <button onClick={simulateMain} className="bg-blue-600 px-4 py-2 rounded">Simulate Route</button>
        <button onClick={simulateTrial} className="bg-purple-600 px-4 py-2 rounded">Simulate Trial</button>
      </div>
      {status && <p className="mb-4">{status}</p>}
      <pre className="bg-black/40 p-4 rounded text-xs overflow-auto max-h-[70vh]">{output ? JSON.stringify(output, null, 2) : "No output"}</pre>
    </div>
  );
}
