import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, requireAdminAuth, shouldUseSecureAdminCookie } from "@/lib/auth";

const loginQueues = new Map<string, Promise<void>>();
const pendingLogins = new Map<string, number>();
const MAX_PENDING_LOGINS_PER_IP = 64;
const MAX_LOGIN_QUEUE_IPS = 256;
const MAX_LOGIN_BODY_BYTES = 4096;
const MAX_LOGIN_PROCESSING_MS = 30_000;
const MAX_LOGIN_QUEUE_WAIT_MS = 30_000;

interface LoginContext {
  req: Request;
  ip: string;
  authenticated: boolean;
  payload: unknown;
  signal: AbortSignal;
}

type CappedBodyRead =
  | { kind: "complete"; chunks: Uint8Array[]; totalBytes: number }
  | { kind: "too-large" }
  | { kind: "aborted" };

export function getClientIp(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const processing = createLoginProcessingSignal(req);
  try {
    return await serializeLogin(
      ip,
      () => handleLoginRequest(req, ip, processing.signal),
      processing.signal,
      processing.startTimeout,
    );
  } finally {
    processing.dispose();
  }
}

export function serializeLogin(ip: string, task: () => Promise<NextResponse>, signal?: AbortSignal, onStart?: () => void): Promise<NextResponse> {
  const pendingCount = pendingLogins.get(ip) ?? 0;
  if (pendingCount >= MAX_PENDING_LOGINS_PER_IP) return Promise.resolve(throttledResponse(1));
  if (isLoginQueueMapFull(ip)) return Promise.resolve(throttledResponse(1));
  pendingLogins.set(ip, pendingCount + 1);
  const previous = loginQueues.get(ip) ?? Promise.resolve();
  const runTask = () => runLoginTask(task, signal, onStart);
  const current = previous.then(runTask, runTask);
  const tail = current.then(() => undefined, () => undefined);
  loginQueues.set(ip, tail);
  const completed = current.finally(() => {
    const remaining = (pendingLogins.get(ip) ?? 1) - 1;
    if (remaining > 0) {
      pendingLogins.set(ip, remaining);
      return;
    }
    pendingLogins.delete(ip);
    if (loginQueues.get(ip) === tail) loginQueues.delete(ip);
  });
  return raceLoginWithAbort(completed, signal);
}

function raceLoginWithAbort(task: Promise<NextResponse>, signal?: AbortSignal): Promise<NextResponse> {
  if (!signal) return task;
  if (signal.aborted) return Promise.resolve(requestTimeoutResponse());
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<NextResponse>((resolve) => {
    onAbort = () => resolve(requestTimeoutResponse());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([task, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

async function handleLoginRequest(req: Request, ip: string, signal: AbortSignal): Promise<NextResponse> {
  const ipLimit = await checkLoginRateLimit(ip, true);
  if (ipLimit) return throttledResponse(ipLimit.retryAfterSeconds);
  if (signal.aborted) return requestTimeoutResponse();

  const existingSession = await requireAdminAuth(req);
  if (signal.aborted) return requestTimeoutResponse();
  const limited = await checkLoginRateLimit(ip, existingSession.ok);
  if (limited) return throttledResponse(limited.retryAfterSeconds);

  const parsed = await readCappedJsonBody(req, signal);
  if (parsed.aborted) return requestTimeoutResponse();
  if (parsed.tooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });

  return handleLogin({ req, ip, authenticated: existingSession.ok, payload: parsed.payload, signal });
}

async function handleLogin(context: LoginContext): Promise<NextResponse> {
  const { req, ip, authenticated, payload, signal } = context;
  const result = await loginAdmin(payload);
  if (signal.aborted) return requestTimeoutResponse();
  if (result.status === 401) {
    const failureLimit = await recordLoginAttempt(ip, authenticated);
    if (failureLimit) return throttledResponse(failureLimit.retryAfterSeconds);
  } else if (result.status === 200) {
    await clearLoginAttempts(ip);
  }

  const response = respondWith(result);
  if (result.status !== 200) return response;
  const token = result.body.token;
  if (typeof token !== "string") return response;
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(req),
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

async function readCappedJsonBody(req: Request, signal: AbortSignal): Promise<{ payload: unknown; tooLarge: boolean; aborted: boolean }> {
  const rejection = bodyPreflightRejection(req, signal);
  if (rejection) return rejection;
  if (!req.body) return parseLoginBody(new Uint8Array(0));
  return readAndParseBody(req.body, signal);
}

function bodyPreflightRejection(req: Request, signal: AbortSignal): { payload: unknown; tooLarge: boolean; aborted: boolean } | null {
  if (signal.aborted) return { payload: null, tooLarge: false, aborted: true };
  if (hasOversizedContentLength(req)) return { payload: null, tooLarge: true, aborted: false };
  return null;
}

async function readAndParseBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<{ payload: unknown; tooLarge: boolean; aborted: boolean }> {
  const reader = body.getReader();
  try {
    return bodyReadResult(await collectBodyChunks(reader, signal));
  } catch {
    return { payload: null, tooLarge: false, aborted: signal.aborted };
  } finally {
    reader.releaseLock();
  }
}

async function collectBodyChunks(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<CappedBodyRead> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await readWithAbort(reader, signal);
    if (!chunk) return { kind: "aborted" };
    if (chunk.done) return { kind: "complete", chunks, totalBytes };
    totalBytes += chunk.value.byteLength;
    if (totalBytes > MAX_LOGIN_BODY_BYTES) {
      void reader.cancel().catch(() => undefined);
      return { kind: "too-large" };
    }
    chunks.push(chunk.value);
  }
}

function bodyReadResult(result: CappedBodyRead): { payload: unknown; tooLarge: boolean; aborted: boolean } {
  if (result.kind === "aborted") return { payload: null, tooLarge: false, aborted: true };
  if (result.kind === "too-large") return { payload: null, tooLarge: true, aborted: false };
  return parseLoginBody(joinBodyChunks(result.chunks, result.totalBytes));
}

function joinBodyChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseLoginBody(bytes: Uint8Array): { payload: unknown; tooLarge: boolean; aborted: boolean } {
  try {
    return { payload: JSON.parse(new TextDecoder().decode(bytes)), tooLarge: false, aborted: false };
  } catch {
    return { payload: null, tooLarge: false, aborted: false };
  }
}

function createLoginProcessingSignal(req: Request): { signal: AbortSignal; startTimeout: () => void; dispose: () => void } {
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queueTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(abortFromRequest, MAX_LOGIN_QUEUE_WAIT_MS);
  if (req.signal.aborted) abortFromRequest();
  if (!req.signal.aborted) req.signal.addEventListener("abort", abortFromRequest, { once: true });
  return {
    signal: controller.signal,
    startTimeout() {
      if (timer !== undefined) return;
      if (queueTimer !== undefined) clearTimeout(queueTimer);
      queueTimer = undefined;
      timer = setTimeout(abortFromRequest, MAX_LOGIN_PROCESSING_MS);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      if (queueTimer !== undefined) clearTimeout(queueTimer);
      req.signal.removeEventListener("abort", abortFromRequest);
    },
  };
}

function runLoginTask(task: () => Promise<NextResponse>, signal?: AbortSignal, onStart?: () => void): Promise<NextResponse> {
  if (signal?.aborted) return Promise.resolve(requestTimeoutResponse());
  if (onStart) onStart();
  return task();
}

function isLoginQueueMapFull(ip: string): boolean {
  if (loginQueues.has(ip)) return false;
  return loginQueues.size >= MAX_LOGIN_QUEUE_IPS;
}

async function readWithAbort(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<ReadableStreamReadResult<Uint8Array> | null> {
  if (signal.aborted) return null;
  let onAbort = () => undefined;
  const aborted = new Promise<null>((resolve) => {
    onAbort = () => {
      void reader.cancel().catch(() => undefined);
      resolve(null);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function hasOversizedContentLength(req: Request): boolean {
  const header = req.headers.get("content-length");
  if (!header) return false;
  const contentLength = Number(header);
  if (!Number.isFinite(contentLength)) return false;
  return contentLength > MAX_LOGIN_BODY_BYTES;
}

function throttledResponse(retryAfterSeconds: number) {
  return NextResponse.json({ error: "Too many login attempts, please try again later" }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds) },
  });
}

function requestTimeoutResponse() {
  return NextResponse.json({ error: "Request timed out" }, { status: 408 });
}
