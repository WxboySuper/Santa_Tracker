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

interface CallInit {
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
  csrf?: boolean;
}

function requestInit(init: CallInit): RequestInit {
  const hasBody = init.body !== undefined;
  return {
    method: init.method,
    credentials: "include",
    headers: { ...(hasBody ? { "Content-Type": "application/json" } : {}), ...(init.csrf ? adminCsrfHeaders() : {}) },
    body: hasBody ? JSON.stringify(init.body) : undefined,
  };
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function errorMessage(response: Response, body: Record<string, unknown>): string {
  const error = typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
  const retry = response.headers.get("retry-after");
  return response.status === 429 && retry ? `${error}. Try again in ${retry} s.` : error;
}

async function call(path: string, init: CallInit): Promise<AdminResult<Record<string, unknown>>> {
  let response: Response;
  try {
    response = await fetch(path, requestInit(init));
  } catch {
    return { ok: false, status: 0, error: "Network error. Check the connection and try again." };
  }
  const body = await readBody(response);
  return response.ok ? { ok: true, value: body } : { ok: false, status: response.status, error: errorMessage(response, body) };
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

/** Options from the server, the browser's passkey prompt, then the server's check of the prompt's answer. */
async function ceremony(kind: "login" | "register", prompt: (options: unknown) => Promise<unknown>): Promise<AdminResult<Record<string, unknown>>> {
  const csrf = kind === "register";
  const options = await call(`/api/admin/passkeys/${kind}/options`, { method: "POST", body: {}, csrf });
  if (!options.ok) return options;
  let answer: unknown;
  try {
    answer = await prompt(options.value.options);
  } catch (error) {
    return { ok: false, status: 0, error: ceremonyError(error) };
  }
  return call(`/api/admin/passkeys/${kind}/verify`, { method: "POST", body: answer, csrf });
}

export async function signInWithPasskey(): Promise<AdminResult<null>> {
  const result = await ceremony("login", options => startAuthentication({ optionsJSON: options as PublicKeyCredentialRequestOptionsJSON }));
  return result.ok ? { ok: true, value: null } : result;
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
  const result = await ceremony("register", options => startRegistration({ optionsJSON: options as PublicKeyCredentialCreationOptionsJSON }));
  return result.ok ? { ok: true, value: { recoveryCodes: codesFrom(result.value) } } : result;
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
