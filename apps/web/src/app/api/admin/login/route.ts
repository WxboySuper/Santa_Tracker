import { NextResponse } from "next/server";
import { createAdminToken, verifyAdminPassword } from "@/lib/auth";
import { getAdminPassword } from "@/lib/config";

export async function POST(req: Request) {
  try {
    const data = await req.json().catch(() => null);
    if (!data || !data.password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }
    const adminPassword = getAdminPassword();
    if (!adminPassword) {
      return NextResponse.json({ error: "Admin access not configured" }, { status: 500 });
    }
    const ok = await verifyAdminPassword(data.password);
    if (!ok) return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    const token = await createAdminToken();
    return NextResponse.json({ token }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
  }
}
