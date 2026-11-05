import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "santa-tracker",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-05",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none", runWorkerFirst: ["/_vinext/static-cache/*"] },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      VINEXT_KV_CACHE: bindings.kv(),
      // Create in Cloudflare dashboard before deploy; name is a placeholder.
      SANTA_SNAPSHOTS: bindings.r2({ name: "santa-tracker-snapshots" }),
      // Runtime vars (surface on process.env via nodejs_compat). Without these the app
      // ignores the R2 binding and keeps Advent disabled. Mirrors wrangler.toml [vars].
      // SECRET_KEY and ADMIN_PASSWORD are set separately with `wrangler secret put`.
      SANTA_STORAGE_BACKEND: bindings.text("r2"),
      ADVENT_ENABLED: bindings.text("true"),
    },
  }),
});
