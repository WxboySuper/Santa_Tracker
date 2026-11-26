import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { appendAuthAudit, consumeAuthChallenge, consumeRecoveryCode, deletePasskey, installPasskey, readAdminAuthState, readPasskey, saveAuthChallenge, updatePasskeyCounter, replaceRecoveryCodes, type AdminAuthChallenge } from "./admin-auth-state";
import { createAdminToken } from "./auth";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

export function webAuthnSettings(request: Request): { rpId: string; origin: string } {
  const url = new URL(request.url);
  const rpId = process.env.ADMIN_WEBAUTHN_RP_ID ?? (process.env.NODE_ENV === "production" ? "" : url.hostname);
  const origin = process.env.ADMIN_WEBAUTHN_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : url.origin);
  const expectedOrigin = parseExpectedOrigin(origin);
  validateRpId(url.hostname, rpId);
  if (process.env.NODE_ENV === "production" && expectedOrigin.protocol !== "https:") throw new Error("WebAuthn origin must use HTTPS in production");
  return { rpId, origin };
}

function parseExpectedOrigin(origin: string): URL {
  if (!origin) throw new Error("WebAuthn origin and RP ID must be configured");
  const parsed = new URL(origin);
  if (parsed.origin !== origin) throw new Error("WebAuthn origin and RP ID must be configured");
  return parsed;
}

function validateRpId(hostname: string, rpId: string): void {
  if (!rpId || (hostname !== rpId && !hostname.endsWith(`.${rpId}`))) {
    throw new Error("Request host does not match the WebAuthn RP ID");
  }
}

export async function createRegistrationChallenge(request: Request, sessionId: string): Promise<{ challenge: AdminAuthChallenge; options: Awaited<ReturnType<typeof generateRegistrationOptions>> }> {
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
  if (!challenge || challenge.sessionId !== input.sessionId) throw new Error("Registration challenge expired or unavailable");
  const { rpId, origin } = webAuthnSettings(input.request);
  const verification = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpId, requireUserVerification: true });
  if (!verification.verified) throw new Error("Passkey registration could not be verified");
  const state = await readAdminAuthState();
  const recoveryCodes = state.recoveryCodeHashes.length === 0 ? generateRecoveryCodes() : null;
  const hashes = recoveryCodes ? await Promise.all(recoveryCodes.map(code => hashRecoveryCode(normalizeRecoveryCode(code)))) : null;
  const credential = verification.registrationInfo.credential;
  await installPasskey({ id: credential.id, publicKey: encodeBase64Url(credential.publicKey), counter: credential.counter, transports: credential.transports }, hashes);
  await appendAuthAudit({ action: "passkey_registration", result: "success", sessionId: input.sessionId });
  return { recoveryCodes };
}

export async function createAuthenticationChallenge(request: Request): Promise<{ challenge: AdminAuthChallenge; options: Awaited<ReturnType<typeof generateAuthenticationOptions>> }> {
  const { rpId } = webAuthnSettings(request);
  const state = await readAdminAuthState();
  if (state.passkeys.length === 0) throw new Error("Passkey login is not configured");
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
  if (!challenge) throw new Error("Authentication challenge expired or unavailable");
  const credential = await readPasskey(input.response.id);
  if (!credential) throw new Error("Unknown passkey");
  const { rpId, origin } = webAuthnSettings(input.request);
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpId,
    requireUserVerification: true,
    credential: { id: credential.id, publicKey: Uint8Array.from(decodeBase64Url(credential.publicKey)), counter: credential.counter, transports: credential.transports },
  });
  if (!verification.verified) throw new Error("Passkey authentication could not be verified");
  await updatePasskeyCounter(credential.id, verification.authenticationInfo.newCounter);
  const token = await createAdminToken();
  await appendAuthAudit({ action: "passkey_login", result: "success" });
  return token;
}

export async function loginWithRecoveryCode(code: string): Promise<string> {
  const state = await readAdminAuthState();
  if (state.passkeys.length === 0) throw new Error("Recovery codes are not configured");
  const valid = await consumeRecoveryCode(await hashRecoveryCode(normalizeRecoveryCode(code)));
  if (!valid) {
    await appendAuthAudit({ action: "recovery_login", result: "failure" });
    throw new Error("Invalid recovery code");
  }
  const token = await createAdminToken();
  await appendAuthAudit({ action: "recovery_login", result: "success" });
  return token;
}

export async function rotateRecoveryCodes(): Promise<string[]> {
  if ((await readAdminAuthState()).passkeys.length === 0) throw new Error("Register a passkey before creating recovery codes");
  const codes = generateRecoveryCodes();
  await replaceRecoveryCodes(await Promise.all(codes.map(code => hashRecoveryCode(normalizeRecoveryCode(code)))));
  await appendAuthAudit({ action: "recovery_codes_rotate", result: "success" });
  return codes;
}

export async function deleteRegisteredPasskey(id: string): Promise<boolean> {
  const removed = await deletePasskey(id);
  if (removed) await appendAuthAudit({ action: "passkey_revoke", result: "success" });
  return removed;
}

export async function recordPasskeyFailure(action: string): Promise<void> {
  await appendAuthAudit({ action, result: "failure" });
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

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return encodeBase64Url(new Uint8Array(digest));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
