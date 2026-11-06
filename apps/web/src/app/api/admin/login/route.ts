import { NextResponse } from "next/server";
import { checkLoginRateLimit, clearLoginAttempts, loginAdmin, recordLoginAttempt } from "@/lib/admin-login";
import { respondWith } from "@/lib/admin-api";
import { ADMIN_SESSION_TTL_SECONDS, requireAdminAuth, shouldUseSecureAdminCookie } from "@/lib/auth";

const loginQueues = new Map<string, Promise<void>>();
const pendingLogins = new Map<string, number>();
const pendingBodyReads = new Map<string, number>();
const MAX_PENDING_LOGINS_PER_IP = 64;
const MAX_LOGIN_QUEUE_IPS = 256;
const MAX_BODY_READS_PER_IP = 16;
const MAX_BODY_READ_IPS = 256;
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

interface RunLoginInput {
  task: () => Promise<NextResponse>;
  signal?: AbortSignal;
  onStart?: () => void;
  markStarted: () => void;
}

type CappedBodyRead =
  | { kind: "complete"; chunks: Uint8Array[]; totalBytes: number }
  | { kind: "too-large" }
  | { kind: "aborted" };

type TimedLoginOperation<T> = { completed: true; value: T } | { completed: false };

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
    const preflight = await checkLoginBeforeBody(req, ip, processing.signal);
    if (!preflight.allowed) {
      cancelUnreadBody(req);
      return preflight.response;
    }
    if (!reserveBodyRead(ip)) {
      cancelUnreadBody(req);
      return throttledResponse(1);
    }
    processing.startTimeout();
    let parsed: Awaited<ReturnType<typeof readCappedJsonBody>>;
    try {
      parsed = await readCappedJsonBody(req, processing.signal);
    } finally {
      releaseBodyRead(ip);
    }
    if (parsed.aborted) return requestTimeoutResponse();
    if (parsed.tooLarge) return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    const context = { req, ip, authenticated: preflight.authenticated, payload: parsed.payload, signal: processing.signal };
    return await serializeLogin(ip, () => handleLogin(context), processing.signal);
  } finally {
    processing.dispose();
  }
}

type LoginPreflight = { allowed: true; authenticated: boolean } | { allowed: false; response: NextResponse };

async function checkLoginBeforeBody(req: Request, ip: string, signal: AbortSignal): Promise<LoginPreflight> {
  const ipLimit = await checkLoginRateLimit(ip, true);
  if (ipLimit) return { allowed: false, response: throttledResponse(ipLimit.retryAfterSeconds) };
  if (signal.aborted) return { allowed: false, response: requestTimeoutResponse() };
  const existingSession = await awaitTimedLoginOperation(() => requireAdminAuth(req), signal);
  if (!existingSession.completed) return { allowed: false, response: requestTimeoutResponse() };
  const globalLimit = await checkLoginRateLimit(ip, existingSession.value.ok);
  if (globalLimit) return { allowed: false, response: throttledResponse(globalLimit.retryAfterSeconds) };
  return { allowed: true, authenticated: existingSession.value.ok };
}

export async function awaitTimedLoginOperation<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<TimedLoginOperation<T>> {
  if (signal.aborted) return { completed: false };
  let removeAbortListener: () => void = () => undefined;
  const aborted = new Promise<TimedLoginOperation<T>>((resolve) => {
    const onAbort = () => resolve({ completed: false });
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
  });
  return Promise.race([
    operation().then((value) => ({ completed: true as const, value })),
    aborted,
  ]).finally(removeAbortListener);
}

function reserveBodyRead(ip: string): boolean {
  const count = pendingBodyReads.get(ip) ?? 0;
  if (count >= MAX_BODY_READS_PER_IP) return false;
  if (!pendingBodyReads.has(ip) && pendingBodyReads.size >= MAX_BODY_READ_IPS) return false;
  pendingBodyReads.set(ip, count + 1);
  return true;
}

function releaseBodyRead(ip: string): void {
  const count = (pendingBodyReads.get(ip) ?? 1) - 1;
  if (count > 0) {
    pendingBodyReads.set(ip, count);
    return;
  }
  pendingBodyReads.delete(ip);
}

export function serializeLogin(ip: string, task: () => Promise<NextResponse>, signal?: AbortSignal, onStart?: () => void): Promise<NextResponse> {
  const pendingCount = pendingLogins.get(ip) ?? 0;
  if (pendingCount >= MAX_PENDING_LOGINS_PER_IP) return Promise.resolve(throttledResponse(1));
  if (isLoginQueueMapFull(ip)) return Promise.resolve(throttledResponse(1));
  pendingLogins.set(ip, pendingCount + 1);
  const previous = loginQueues.get(ip) ?? Promise.resolve();
  let taskStarted = false;
  const runTask = () => runLoginTask({ task, signal, onStart, markStarted: () => { taskStarted = true; } });
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
  return raceLoginWithAbort(completed, signal, () => taskStarted);
}

function raceLoginWithAbort(task: Promise<NextResponse>, signal: AbortSignal | undefined, hasStarted: () => boolean): Promise<NextResponse> {
  if (!signal) return task;
  if (signal.aborted) return Promise.resolve(requestTimeoutResponse());
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<NextResponse>((resolve) => {
    onAbort = () => {
      if (!hasStarted()) resolve(requestTimeoutResponse());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([task, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

async function handleLogin(context: LoginContext): Promise<NextResponse> {
  const limited = await checkLoginRateLimit(context.ip, context.authenticated);
  if (limited) return throttledResponse(limited.retryAfterSeconds);
  const verification = await awaitTimedLoginOperation(() => loginAdmin(context.payload), context.signal);
  if (!verification.completed) {
    await recordLoginAttempt(context.ip, context.authenticated);
    return requestTimeoutResponse();
  }
  const result = verification.value;
  if (result.status === 401) return handleFailedLogin(context, result);
  if (result.status === 200) return handleSuccessfulLogin(context, result);
  if (context.signal.aborted) return requestTimeoutResponse();
  return respondWith(result);
}

async function handleFailedLogin(context: LoginContext, result: Awaited<ReturnType<typeof loginAdmin>>): Promise<NextResponse> {
  const failureLimit = await recordLoginAttempt(context.ip, context.authenticated);
  if (context.signal.aborted) return requestTimeoutResponse();
  if (failureLimit) return throttledResponse(failureLimit.retryAfterSeconds);
  return respondWith(result);
}

async function handleSuccessfulLogin(context: LoginContext, result: Awaited<ReturnType<typeof loginAdmin>>): Promise<NextResponse> {
  await clearLoginAttempts(context.ip);
  if (context.signal.aborted) return requestTimeoutResponse();
  const response = respondWith(result);
  const token = result.body.token;
  if (typeof token !== "string") return response;
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie(context.req),
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
  if (hasOversizedContentLength(req)) {
    cancelUnreadBody(req);
    return { payload: null, tooLarge: true, aborted: false };
  }
  return null;
}

async function readAndParseBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<{ payload: unknown; tooLarge: boolean; aborted: boolean }> {
  const reader = body.getReader();
  try {
    return bodyReadResult(await collectBodyChunks(reader, signal));
  } catch {
    return { payload: null, tooLarge: false, aborted: signal.aborted };
  } finally {
    if (!signal.aborted) reader.releaseLock();
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
  const abortFromRequest = () => abortLoginProcessing(req, controller);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queueTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(abortFromRequest, MAX_LOGIN_QUEUE_WAIT_MS);
  const removeRequestAbortListener = listenForRequestAbort(req, abortFromRequest);
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
      removeRequestAbortListener();
    },
  };
}

function abortLoginProcessing(req: Request, controller: AbortController): void {
  controller.abort();
  cancelUnreadBody(req);
}

function cancelUnreadBody(req: Request): void {
  if (!req.body) return;
  if (req.body.locked) return;
  void req.body.cancel().catch(() => undefined);
}

function listenForRequestAbort(req: Request, callback: () => void): () => void {
  if (req.signal.aborted) {
    callback();
    return () => undefined;
  }
  req.signal.addEventListener("abort", callback, { once: true });
  return () => req.signal.removeEventListener("abort", callback);
}

function runLoginTask(input: RunLoginInput): Promise<NextResponse> {
  const { task, signal, onStart, markStarted } = input;
  if (signal?.aborted) return Promise.resolve(requestTimeoutResponse());
  markStarted();
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
