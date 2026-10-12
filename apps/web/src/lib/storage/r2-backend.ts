import type { VersionedStoreBackend } from "./versioned-store-core";

export interface R2BucketLike {
  get(key: string): Promise<{ text(): Promise<string>; etag?: string; uploaded?: Date } | null>;
  put(key: string, value: string, options?: { onlyIf?: Headers | { etagMatches?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: { key: string }[] }>;
}

export function createR2Backend(bucket: R2BucketLike): VersionedStoreBackend {
  return {
    async read(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return obj.text();
    },
    async write(key, body) {
      await bucket.put(key, body);
    },
    async delete(key) {
      await bucket.delete(key);
      return true;
    },
    async list(prefix) {
      const result = await bucket.list({ prefix });
      return result.objects.map(o => o.key);
    },
  };
}
