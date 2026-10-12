import fs from "node:fs/promises";
import path from "node:path";
import type { VersionedStoreBackend } from "./versioned-store-core";

export function createFilesystemBackend(rootDir: string): VersionedStoreBackend {
  const base = path.resolve(rootDir, ".versioned");

  function isSafeRelativeKey(relative: string): boolean {
    if (!relative) return false;
    if (relative.split(path.sep)[0] === "..") return false;
    return !path.isAbsolute(relative);
  }

  function resolveKey(key: string): string {
    const full = path.resolve(base, key);
    const relative = path.relative(base, full);
    if (!isSafeRelativeKey(relative)) throw new Error("Invalid storage key");
    return full;
  }

  return {
    async read(key) {
      try {
        return await fs.readFile(resolveKey(key), "utf-8");
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async write(key, body) {
      const full = resolveKey(key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const tmp = `${full}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      await fs.writeFile(tmp, body, "utf-8");
      await fs.rename(tmp, full);
    },

    async delete(key) {
      try {
        await fs.unlink(resolveKey(key));
        return true;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },

    async list(prefix) {
      const dir = resolveKey(prefix);
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
