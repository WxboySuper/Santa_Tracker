export type CappedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

type ByteResult = { ok: true; bytes: Uint8Array } | { ok: false; status: 400 | 413; error: string };

export async function readCappedJson(request: Request, maxBytes: number): Promise<CappedJsonResult> {
  const headerError = jsonHeaderError(request, maxBytes);
  if (headerError) return headerError;
  const body = await readCappedBody(request.body, maxBytes);
  if (!body.ok) return body;
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(body.bytes)) as unknown }; }
  catch { return { ok: false, status: 400, error: "Request body must be valid JSON" }; }
}

function jsonHeaderError(request: Request, maxBytes: number): CappedJsonResult | null {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }
  const length = request.headers.get("content-length");
  if (length === null) return null;
  const declared = Number(length);
  if (!Number.isSafeInteger(declared) || declared < 0) {
    return { ok: false, status: 400, error: "Invalid Content-Length" };
  }
  if (declared > maxBytes) return { ok: false, status: 413, error: "Request body is too large" };
  return null;
}

async function readCappedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<ByteResult> {
  if (!body) return { ok: true, bytes: new Uint8Array() };
  const reader = body.getReader();
  try { return await collectChunks(reader, maxBytes); }
  catch { return { ok: false, status: 400, error: "Unable to read request body" }; }
  finally { reader.releaseLock(); }
}

async function collectChunks(reader: ReadableStreamDefaultReader<Uint8Array>, maxBytes: number): Promise<ByteResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return { ok: true, bytes: joinChunks(chunks, total) };
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: "Request body is too large" };
    }
    chunks.push(chunk.value);
  }
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
