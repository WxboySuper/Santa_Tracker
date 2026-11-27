import { readFile, writeFile } from "node:fs/promises";

// Adds the production WebAuthn relying party to the app Worker's [vars] for this deploy job only, so local and preview
// runs keep falling back to their own request host.
const rpId = process.env.ADMIN_WEBAUTHN_RP_ID;
const origin = process.env.ADMIN_WEBAUTHN_ORIGIN;
if (!rpId || !/^[a-z0-9.-]+$/i.test(rpId)) throw new Error("Set ADMIN_WEBAUTHN_RP_ID to the production host name");
if (!origin || !origin.startsWith("https://") || new URL(origin).origin !== origin || new URL(origin).hostname !== rpId) {
  throw new Error("Set ADMIN_WEBAUTHN_ORIGIN to https://<ADMIN_WEBAUTHN_RP_ID>");
}

const configPath = "apps/web/wrangler.toml";
const config = await readFile(configPath, "utf8");
if (config.includes("ADMIN_WEBAUTHN_RP_ID")) throw new Error(`${configPath} already declares ADMIN_WEBAUTHN_RP_ID`);
const anchor = "[vars]\n";
if (!config.includes(anchor)) throw new Error(`${configPath} is missing its [vars] table`);
await writeFile(configPath, config.replace(anchor, `${anchor}ADMIN_WEBAUTHN_RP_ID = "${rpId}"\nADMIN_WEBAUTHN_ORIGIN = "${origin}"\n`));
