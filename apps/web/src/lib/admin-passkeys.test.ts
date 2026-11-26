import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { deletePasskey, installPasskey, resetAdminAuthStateForTests, readAdminAuthState } from "./admin-auth-state";
import { createAuthenticationChallenge, createRegistrationChallenge, finishAuthentication, finishRegistration, loginWithRecoveryCode, webAuthnSettings } from "./admin-passkeys";
import { verifyAdminToken } from "./auth";
import { loginAdmin } from "./admin-login";

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "auth-challenge", allowCredentials: [] })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "register-challenge", rp: { id: "example.test", name: "Admin" } })),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

const request = new Request("https://example.test/api/admin/passkeys");

async function registerPasskeyForTest(counter: number) {
  const { challenge } = await createRegistrationChallenge(request, "session-one");
  vi.mocked(verifyRegistrationResponse).mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: { id: "credential-one", publicKey: Uint8Array.from([1, 2, 3]), counter },
      credentialType: "public-key", fmt: "none", aaguid: "", attestationObject: new Uint8Array(), userVerified: true,
      credentialDeviceType: "singleDevice", credentialBackedUp: false, origin: "https://example.test", rpID: "example.test",
    },
  });
  return finishRegistration({ request, challengeId: challenge.id, sessionId: "session-one", response: { id: "credential-one" } as RegistrationResponseJSON });
}

describe("admin passkey service", () => {
  beforeEach(async () => {
    await resetAdminAuthStateForTests();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ADMIN_WEBAUTHN_RP_ID", "example.test");
    vi.stubEnv("ADMIN_WEBAUTHN_ORIGIN", "https://example.test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires HTTPS for the production WebAuthn origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_WEBAUTHN_ORIGIN", "http://example.test");
    expect(() => webAuthnSettings(request)).toThrow("must use HTTPS in production");
  });

  it("registers a passkey and returns one-time recovery codes", async () => {
    const { challenge } = await createRegistrationChallenge(request, "session-one");
    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: "credential-one", publicKey: Uint8Array.from([1, 2, 3]), counter: 0, transports: ["internal"] },
        credentialType: "public-key", fmt: "none", aaguid: "", attestationObject: new Uint8Array(), userVerified: true,
        credentialDeviceType: "multiDevice", credentialBackedUp: true, origin: "https://example.test", rpID: "example.test",
      },
    });
    const result = await finishRegistration({ request, challengeId: challenge.id, sessionId: "session-one", response: { id: "credential-one" } as RegistrationResponseJSON });
    expect(result.recoveryCodes).toHaveLength(10);
    expect((await readAdminAuthState()).passkeys).toHaveLength(1);
    expect((await readAdminAuthState()).recoveryCodeHashes).toHaveLength(10);
  });

  it("consumes recovery codes once and creates a revocable session", async () => {
    const { recoveryCodes } = await registerPasskeyForTest(0);
    const token = await loginWithRecoveryCode(recoveryCodes![0]!);
    expect(await verifyAdminToken(token)).toBe(true);
    await expect(loginWithRecoveryCode(recoveryCodes![0]!)).rejects.toThrow("Invalid recovery code");
    expect((await readAdminAuthState()).recoveryCodeHashes).toHaveLength(9);
  });

  it("verifies a passkey login and advances its signature counter", async () => {
    await registerPasskeyForTest(1);
    const authentication = await createAuthenticationChallenge(request);
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { credentialID: "credential-one", newCounter: 2, userVerified: true, credentialDeviceType: "singleDevice", credentialBackedUp: false, origin: "https://example.test", rpID: "example.test" },
    });
    const token = await finishAuthentication({ request, challengeId: authentication.challenge.id, response: { id: "credential-one" } as AuthenticationResponseJSON });
    expect(await verifyAdminToken(token)).toBe(true);
    expect((await readAdminAuthState()).passkeys[0]?.counter).toBe(2);
    await expect(finishAuthentication({ request, challengeId: authentication.challenge.id, response: { id: "credential-one" } as AuthenticationResponseJSON })).rejects.toThrow("Authentication challenge expired or unavailable");
  });

  it("disables password login after passkey setup without revealing password correctness", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct horse");
    await installPasskey({ id: "credential-one", publicKey: "AQID", counter: 0 }, []);
    const correct = await loginAdmin({ password: "correct horse" });
    const incorrect = await loginAdmin({ password: "wrong" });
    expect(correct.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(correct.body).toEqual(incorrect.body);
  });

  it("does not allow deleting the last passkey", async () => {
    await installPasskey({ id: "credential-one", publicKey: "AQID", counter: 0 }, []);
    await expect(deletePasskey("credential-one")).rejects.toThrow("At least one passkey must remain registered");
    expect((await readAdminAuthState()).passkeys).toHaveLength(1);
  });
});
