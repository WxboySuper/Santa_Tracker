import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { appendAuthAudit, consumeAuthChallenge, consumeRecoveryCode, consumeRecoveryCodeForSession, deletePasskey, installPasskey, readAdminAuthState, readPasskey, saveAuthChallenge, updatePasskeyCounter, replaceRecoveryCodes, type AdminAuthChallenge, type StoredPasskey } from "./admin-auth-state";
import { createAdminToken } from "./auth";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

export class PasskeyRequestError extends Error {}
export class PasskeyRegistrationConflictError extends Error {}

export function webAuthnSettings(request: Request, isProduction = process.env.NODE_ENV === "production"): { rpId: string; origin: string } {
  const url = new URL(request.url);
  const rpId = process.env.ADMIN_WEBAUTHN_RP_ID ?? (isProduction ? "" : url.hostname);
  const origin = process.env.ADMIN_WEBAUTHN_ORIGIN ?? (isProduction ? "" : url.origin);
  const expectedOrigin = parseExpectedOrigin({ origin });
  validateRpId({ hostname: url.hostname, rpId });
  if (isProduction && expectedOrigin.protocol !== "https:") throw new Error("WebAuthn origin must use HTTPS in production");
  return { rpId, origin };
}

function parseExpectedOrigin(input: { origin: string }): URL {
  const { origin } = input;
  if (!origin) throw new Error("WebAuthn origin and RP ID must be configured");
  const parsed = new URL(origin);
  if (parsed.origin !== origin) throw new Error("WebAuthn origin and RP ID must be configured");
  return parsed;
}

function validateRpId(input: { hostname: string; rpId: string }): void {
  const { hostname, rpId } = input;
  if (!rpId) throw new Error("Request host does not match the WebAuthn RP ID");
  if (!isWithinRpDomain({ hostname, rpId })) {
    throw new Error("Request host does not match the WebAuthn RP ID");
  }
}

function isWithinRpDomain(input: { hostname: string; rpId: string }): boolean {
  const { hostname, rpId } = input;
  return hostname === rpId || hostname.endsWith(`.${rpId}`);
}

export async function createRegistrationChallenge(input: { request: Request; sessionId: string }): Promise<{ challenge: AdminAuthChallenge; options: Awaited<ReturnType<typeof generateRegistrationOptions>> }> {
  const { request, sessionId } = input;
  const { rpId } = webAuthnSettings(request);
  const state = await readAdminAuthState();
  const options = await generateRegistrationOptions({
    rpName: "Santa Tracker Admin",
    rpID: rpId,
    userID: new TextEncoder().encode("santa-tracker-single-owner"),
    userName: "owner",
    userDisplayName: "Santa Tracker Owner",
    attestationType: "none",
    timeout: CHALLENGE_TTL_MS,
    excludeCredentials: state.passkeys.map(passkey => ({ id: passkey.id, transports: passkey.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const result = await saveChallenge({ purpose: "registration", sessionId, challenge: options.challenge }, options);
  await appendAuthAudit({ action: "passkey_registration_start", result: "success", sessionId });
  return result;
}

export async function finishRegistration(input: { request: Request; challengeId: string; sessionId: string; response: RegistrationResponseJSON }): Promise<{ recoveryCodes: string[] | null }> {
  const challenge = await consumeAuthChallenge(input.challengeId, "registration");
  if (!challenge || challenge.sessionId !== input.sessionId) throw new PasskeyRequestError("Registration challenge expired or unavailable");
  const credential = await verifyRegistration(input, challenge.challenge);
  const recoveryCodes = await generateFirstRecoverySet();
  const hashes = await hashRecoverySet(recoveryCodes);
  const recoveryCodesStored = await installRegistrationCredential(credential, hashes);
  await appendAuthAudit({ action: "passkey_registration", result: "success", sessionId: input.sessionId });
  if (!recoveryCodesStored) return { recoveryCodes: null };
  return { recoveryCodes };
}

async function hashRecoverySet(codes: string[] | null): Promise<string[] | null> {
  if (!codes) return null;
  return Promise.all(codes.map(code => hashRecoveryCode({ code: normalizeRecoveryCode({ code }) })));
}

async function installRegistrationCredential(credential: Awaited<ReturnType<typeof verifyRegistration>>, hashes: string[] | null): Promise<boolean> {
  try {
    return await installPasskey({ id: credential.id, publicKey: encodeBase64Url(credential.publicKey), counter: credential.counter, transports: credential.transports }, hashes);
  } catch (error) {
    if (error instanceof Error && (error.message === "Passkey is already registered" || error.message === "Passkey limit reached")) {
      throw new PasskeyRegistrationConflictError(error.message);
    }
    throw error;
  }
}

async function verifyRegistration(input: { request: Request; response: RegistrationResponseJSON }, challenge: string) {
  const { rpId, origin } = webAuthnSettings(input.request);
  let result;
  try { result = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true }); }
  catch { throw new PasskeyRequestError("Passkey registration could not be verified"); }
  if (!result.verified) throw new PasskeyRequestError("Passkey registration could not be verified");
  return result.registrationInfo.credential;
}

async function generateFirstRecoverySet(): Promise<string[] | null> {
  if ((await readAdminAuthState()).recoveryCodeHashes.length > 0) return null;
  return generateRecoveryCodes();
}

export async function createAuthenticationChallenge(request: Request): Promise<{ challenge: AdminAuthChallenge; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  const { rpId } = webAuthnSettings(request);
  const state = await readAdminAuthState();
  if (state.passkeys.length === 0) throw new PasskeyRequestError("Passkey login is not configured");
  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: state.passkeys.map(passkey => ({ id: passkey.id, transports: passkey.transports })),
    userVerification: "required",
    timeout: CHALLENGE_TTL_MS,
  });
  const result = await saveChallenge({ purpose: "authentication", sessionId: null, challenge: options.challenge }, options);
  await appendAuthAudit({ action: "passkey_login_start", result: "success" });
  return result;
}

export async function finishAuthentication(input: { request: Request; challengeId: string; response: AuthenticationResponseJSON }): Promise<string> {
  const challenge = await consumeAuthChallenge(input.challengeId, "authentication");
  if (!challenge) throw new PasskeyRequestError("Authentication challenge expired or unavailable");
  const credential = await readPasskey(input.response.id);
  if (!credential) throw new PasskeyRequestError("Unknown passkey");
  const newCounter = await verifyAuthentication(input, challenge.challenge, credential);
  await ensureCounterAdvances(credential.counter, newCounter);
  await updatePasskeyCounter(credential.id, newCounter);
  const token = await createAdminToken({ authMethod: "passkey" });
  await appendAuthAudit({ action: "passkey_login", result: "success" });
  return token;
}

async function verifyAuthentication(input: { request: Request; response: AuthenticationResponseJSON }, challenge: string, credential: StoredPasskey): Promise<number> {
  const { rpId, origin } = webAuthnSettings(input.request);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
      credential: { id: credential.id, publicKey: Uint8Array.from(decodeBase64Url({ value: credential.publicKey })), counter: credential.counter, transports: credential.transports },
    });
  } catch { throw new PasskeyRequestError("Passkey authentication could not be verified"); }
  if (!verification.verified) throw new PasskeyRequestError("Passkey authentication could not be verified");
  return verification.authenticationInfo.newCounter;
}

async function ensureCounterAdvances(previous: number, next: number): Promise<void> {
  if (previous === 0 && next === 0) return;
  if (next > previous) return;
  await appendAuthAudit({ action: "passkey_login", result: "failure" });
  throw new PasskeyRequestError("Passkey counter did not advance");
}

export async function loginWithRecoveryCode(input: { code: string }): Promise<string> {
  const state = await readAdminAuthState();
  if (state.passkeys.length === 0) throw new PasskeyRequestError("Recovery codes are not configured");
  const valid = await consumeRecoveryCode(await hashRecoveryCode({ code: normalizeRecoveryCode(input) }));
  if (!valid) {
    await appendAuthAudit({ action: "recovery_login", result: "failure" });
    throw new PasskeyRequestError("Invalid recovery code");
  }
  const token = await createAdminToken({ authMethod: "recovery" });
  await appendAuthAudit({ action: "recovery_login", result: "success" });
  return token;
}

export async function authorizeRecoverySessionForPasskeyManagement(input: { code: string; sessionId: string }): Promise<boolean> {
  const hash = await hashRecoveryCode({ code: normalizeRecoveryCode(input) });
  const consumed = await consumeRecoveryCodeForSession(hash, input.sessionId);
  if (!consumed) {
    await appendAuthAudit({ action: "recovery_management_authorize", result: "failure", sessionId: input.sessionId });
    return false;
  }
  await appendAuthAudit({ action: "recovery_management_authorize", result: "success", sessionId: input.sessionId });
  return true;
}

export async function rotateRecoveryCodes(): Promise<string[]> {
  if ((await readAdminAuthState()).passkeys.length === 0) throw new Error("Register a passkey before creating recovery codes");
  const codes = generateRecoveryCodes();
  await replaceRecoveryCodes(await Promise.all(codes.map(code => hashRecoveryCode({ code: normalizeRecoveryCode({ code }) }))));
  await appendAuthAudit({ action: "recovery_codes_rotate", result: "success" });
  return codes;
}

export async function deleteRegisteredPasskey(input: { id: string }): Promise<boolean> {
  const removed = await deletePasskey(input.id);
  if (removed) await appendAuthAudit({ action: "passkey_revoke", result: "success" });
  return removed;
}

export async function recordPasskeyFailure(input: { action: string }): Promise<void> {
  await appendAuthAudit({ action: input.action, result: "failure" });
}

async function saveChallenge<T extends { challenge: string }>(input: { purpose: AdminAuthChallenge["purpose"]; sessionId: string | null; challenge: string }, options: T): Promise<{ challenge: AdminAuthChallenge; options: T }> {
  const challenge: AdminAuthChallenge = { id: crypto.randomUUID(), challenge: input.challenge, purpose: input.purpose, sessionId: input.sessionId, expiresAt: Date.now() + CHALLENGE_TTL_MS };
  await saveAuthChallenge(challenge);
  return { challenge, options };
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    return raw.match(/.{1,4}/g)!.join("-");
  });
}

function normalizeRecoveryCode(input: { code: string }): string {
  return input.code.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

async function hashRecoveryCode(input: { code: string }): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.code));
  return encodeBase64Url(new Uint8Array(digest));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: { value: string }): Uint8Array {
  const { value } = input;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
