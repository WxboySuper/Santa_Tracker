import fs from "node:fs/promises";
import path from "node:path";
import type { VersionedStoreBackend } from "./versioned-store-core";

export function createFilesystemBackend(rootDir: string): VersionedStoreBackend {
  const base = path.join(rootDir, ".versioned");

  async function resolveKey(key: string): Promise<string> {
    const full = path.join(base, key);
    if (!full.startsWith(base)) throw new Error("Invalid storage key");
    return full;
  }

  return {
    async read(key) {
      try {
        return await fs.readFile(await resolveKey(key), "utf-8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async write(key, body) {
      const full = await resolveKey(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const tmp = `${full}.tmp.${Date.now()}`;
      await fs.writeFile(tmp, body, "utf-8");
      await fs.rename(tmp, full);
    },

    async delete(key) {
      try {
        await fs.unlink(await resolveKey(key));
        return true;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },

    async list(prefix) {
      const dir = await resolveKey(prefix);
      try {
        const names = await fs.readdir(dir);
        return names
          .filter(name => name.endsWith(".json"))
          .map(name => `${prefix}${name}`);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    },
  };
}
