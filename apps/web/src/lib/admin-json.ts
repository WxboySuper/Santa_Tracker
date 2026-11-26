export type CappedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

type BytesResult = { ok: true; bytes: Uint8Array } | { ok: false; status: 400 | 413; error: string };

export async function readCappedJson(request: Request, maxBytes: number): Promise<CappedJsonResult> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return { ok: false, status: 415, error: "Content-Type must be application/json" };
  const length = request.headers.get("content-length");
  if (length !== null) {
    const declared = Number(length);
    if (!Number.isSafeInteger(declared) || declared < 0) return { ok: false, status: 400, error: "Invalid Content-Length" };
    if (declared > maxBytes) return { ok: false, status: 413, error: "Request body is too large" };
  }
  const result = await readBytes(request.body, maxBytes);
  if (!result.ok) return result;
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(result.bytes)) as unknown }; }
  catch { return { ok: false, status: 400, error: "Request body must be valid JSON" }; }
}

async function readBytes(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<BytesResult> {
  if (!body) return { ok: true, bytes: new Uint8Array() };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "Request body is too large" };
      }
      chunks.push(item.value);
    }
  } catch { return { ok: false, status: 400, error: "Unable to read request body" }; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { ok: true, bytes };
}
