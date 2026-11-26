export type CappedBodyResult = { kind: "bytes"; value: Uint8Array } | { kind: "invalid" } | { kind: "too-large" };

export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<CappedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { kind: "invalid" };
  if (!body) return { kind: "bytes", value: new Uint8Array() };
  const reader = body.getReader();
  try { return await collectCappedBody(reader, maxBytes); }
  catch { return { kind: "invalid" }; }
  finally { reader.releaseLock(); }
}

async function collectCappedBody(reader: ReadableStreamDefaultReader<Uint8Array>, maxBytes: number): Promise<CappedBodyResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return { kind: "bytes", value: joinChunks(chunks, total) };
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      return { kind: "too-large" };
    }
    chunks.push(chunk.value);
  }
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const value = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    value.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return value;
}
