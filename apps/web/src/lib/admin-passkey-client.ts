import { startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { adminCsrfHeaders } from "@/lib/admin-csrf";

/** The result of an admin auth call: success with its body, or a message fit to show the owner. */
export type AdminResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export interface PasskeySummary {
  passkeys: { id: string; transports: string[] }[];
  recoveryCodesRemaining: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function call(path: string, init: { method: "GET" | "POST" | "DELETE"; body?: unknown; csrf?: boolean }): Promise<AdminResult<Record<string, unknown>>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      credentials: "include",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.csrf ? adminCsrfHeaders() : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, status: 0, error: "Network error. Check the connection and try again." };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  const body = isRecord(value) ? value : {};
  if (response.ok) return { ok: true, value: body };
  const retry = response.headers.get("retry-after");
  const error = typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
  return { ok: false, status: response.status, error: response.status === 429 && retry ? `${error}. Try again in ${retry} s.` : error };
}

function codesFrom(body: Record<string, unknown>): string[] {
  return Array.isArray(body.recoveryCodes) ? body.recoveryCodes.filter((code): code is string => typeof code === "string") : [];
}

/** A cancelled or timed-out browser prompt is not an error worth alarming the owner about. */
function ceremonyError(error: unknown): string {
  if (error instanceof WebAuthnError && error.code === "ERROR_CEREMONY_ABORTED") return "Passkey prompt was cancelled.";
  if (error instanceof Error && error.name === "NotAllowedError") return "Passkey prompt was cancelled or timed out.";
  if (error instanceof WebAuthnError && error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "This device already has a passkey for the admin.";
  return error instanceof Error ? error.message : "The passkey prompt failed.";
}

export async function signInWithPasskey(): Promise<AdminResult<null>> {
  const options = await call("/api/admin/passkeys/login/options", { method: "POST", body: {} });
  if (!options.ok) return options;
  let assertion: unknown;
  try {
    assertion = await startAuthentication({ optionsJSON: options.value.options as PublicKeyCredentialRequestOptionsJSON });
  } catch (error) {
    return { ok: false, status: 0, error: ceremonyError(error) };
  }
  const verified = await call("/api/admin/passkeys/login/verify", { method: "POST", body: assertion });
  return verified.ok ? { ok: true, value: null } : verified;
}

export async function signInWithPassword(password: string): Promise<AdminResult<null>> {
  const result = await call("/api/admin/login", { method: "POST", body: { password } });
  return result.ok ? { ok: true, value: null } : result;
}

export async function signInWithRecoveryCode(code: string): Promise<AdminResult<null>> {
  const result = await call("/api/admin/passkeys/recovery", { method: "POST", body: { code: code.trim() } });
  return result.ok ? { ok: true, value: null } : result;
}

export async function loadPasskeys(): Promise<AdminResult<PasskeySummary>> {
  const result = await call("/api/admin/passkeys", { method: "GET" });
  if (!result.ok) return result;
  const list = Array.isArray(result.value.passkeys) ? result.value.passkeys : [];
  const passkeys = list.filter(isRecord).map(item => ({
    id: typeof item.id === "string" ? item.id : "",
    transports: Array.isArray(item.transports) ? item.transports.filter((t): t is string => typeof t === "string") : [],
  }));
  const remaining = typeof result.value.recoveryCodesRemaining === "number" ? result.value.recoveryCodesRemaining : 0;
  return { ok: true, value: { passkeys, recoveryCodesRemaining: remaining } };
}

/** Registers a passkey on this device. The first registration returns the recovery codes, which are shown once. */
export async function registerPasskey(): Promise<AdminResult<{ recoveryCodes: string[] }>> {
  const options = await call("/api/admin/passkeys/register/options", { method: "POST", body: {}, csrf: true });
  if (!options.ok) return options;
  let attestation: unknown;
  try {
    attestation = await startRegistration({ optionsJSON: options.value.options as PublicKeyCredentialCreationOptionsJSON });
  } catch (error) {
    return { ok: false, status: 0, error: ceremonyError(error) };
  }
  const verified = await call("/api/admin/passkeys/register/verify", { method: "POST", body: attestation, csrf: true });
  return verified.ok ? { ok: true, value: { recoveryCodes: codesFrom(verified.value) } } : verified;
}

export async function removePasskey(id: string): Promise<AdminResult<null>> {
  const result = await call("/api/admin/passkeys", { method: "DELETE", body: { id }, csrf: true });
  return result.ok ? { ok: true, value: null } : result;
}

export async function replaceRecoveryCodes(): Promise<AdminResult<{ recoveryCodes: string[] }>> {
  const result = await call("/api/admin/passkeys", { method: "POST", body: {}, csrf: true });
  return result.ok ? { ok: true, value: { recoveryCodes: codesFrom(result.value) } } : result;
}

/** A session that signed in with one recovery code needs a second one before it can change passkeys. */
export async function confirmRecoverySession(code: string): Promise<AdminResult<null>> {
  const result = await call("/api/admin/passkeys/recovery/authorize-management", { method: "POST", body: { code: code.trim() }, csrf: true });
  return result.ok ? { ok: true, value: null } : result;
}

export function needsSecondRecoveryCode(result: AdminResult<unknown>): boolean {
  return !result.ok && result.status === 403 && /second recovery code/i.test(result.error);
}
