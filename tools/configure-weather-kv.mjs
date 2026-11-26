import { readFile, writeFile } from "node:fs/promises";

const namespaceId = process.env.WEATHER_CACHE_NAMESPACE_ID;
if (!namespaceId || !/^[a-f0-9]{32}$/i.test(namespaceId)) {
  throw new Error("Set the WEATHER_CACHE_NAMESPACE_ID repository variable to the 32-character ID of the weather KV namespace");
}

const binding = `[[kv_namespaces]]\nbinding = "WEATHER_CACHE"\nid = "${namespaceId}"\n\n`;
for (const configPath of ["apps/web/wrangler.toml", "apps/web/weather-cron.wrangler.toml"]) {
  const config = await readFile(configPath, "utf8");
  if (config.includes('binding = "WEATHER_CACHE"')) {
    throw new Error(`${configPath} already declares WEATHER_CACHE`);
  }
  const anchor = "[[durable_objects.bindings]]";
  if (!config.includes(anchor)) {
    throw new Error(`${configPath} is missing the durable object binding insertion point`);
  }
  await writeFile(configPath, config.replace(anchor, `${binding}${anchor}`));
}
