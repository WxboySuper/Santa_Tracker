export type CappedBodyResult = { kind: "bytes"; value: Uint8Array } | { kind: "invalid" } | { kind: "too-large" };

export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<CappedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { kind: "invalid" };
  if (!body) return { kind: "bytes", value: new Uint8Array() };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        const value = new Uint8Array(total);
        let offset = 0;
        for (const part of chunks) {
          value.set(part, offset);
          offset += part.byteLength;
        }
        return { kind: "bytes", value };
      }
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}
