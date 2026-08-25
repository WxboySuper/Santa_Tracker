import { createAdminToken, verifyAdminPassword } from "./auth";
import { getAdminPassword } from "./config";
import { badRequest, isRecord, type AdminApiResult } from "./admin-api";

export async function loginAdmin(payload: unknown): Promise<AdminApiResult> {
  try {
    return await issueSessionToken(payload);
  } catch {
    return badRequest("Invalid data format");
  }
}

async function issueSessionToken(payload: unknown): Promise<AdminApiResult> {
  const password = extractPassword(payload);
  if (!password) return badRequest("Password required");
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return { status: 500, body: { error: "Admin access not configured" } };
  }
  if (!(await verifyAdminPassword(password as string))) {
    return { status: 401, body: { error: "Invalid password" } };
  }
  const token = await createAdminToken();
  return { status: 200, body: { token } };
}

function extractPassword(payload: unknown): unknown {
  if (!isRecord(payload)) return null;
  return payload.password;
}
