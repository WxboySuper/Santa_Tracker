import { LegacyRouteFixtureSchema } from "@santa-tracker/contracts";
import { getSantaSnapshotsBucket } from "./cloudflare-bindings";
import { withWriteLock } from "./file-lock";
import { getKeyValueStore, getSnapshotStore } from "./storage";
import type { VersionedSnapshotStore } from "./storage/types";

export const DATASET_ROUTE_DRAFT = "santa-route-draft";
const REVISIONS_KEY = `${DATASET_ROUTE_DRAFT}/named-revisions.json`;

export interface NamedRouteRevision {
  id: string;
  name: string;
  versionId: string;
  createdAt: string;
}

export interface RouteDraftState {
  versionId: string | null;
  etag: string;
  data: unknown;
  savedAt: string | null;
  validation: { valid: boolean; issues: string[] };
  source: "draft" | "published" | "empty";
}

export interface RouteDraftService {
  getState(): Promise<RouteDraftState>;
  save(data: unknown, expectedEtag: string): Promise<RouteDraftState>;
  listRevisions(): Promise<NamedRouteRevision[]>;
  compareRevisions(leftId: string, rightId: string): Promise<{ left: NamedRouteRevision; right: NamedRouteRevision; leftData: unknown; rightData: unknown }>;
  createRevision(name: string, expectedEtag: string): Promise<NamedRouteRevision>;
  restoreRevision(revisionId: string, expectedEtag: string): Promise<RouteDraftState>;
}

interface DraftEnvelope {
  data: unknown;
  savedAt: string;
}

interface RouteDraftSource {
  versionId: string | null;
  raw: string | null;
  source: RouteDraftState["source"];
}

function etagFor(versionId: string | null, source: RouteDraftState["source"]): string {
  return `"${source === "published" ? `published:${versionId}` : versionId ?? "empty"}"`;
}

function normalizeEtag(etag: string): string {
  return etag.trim().replace(/^"|"$/g, "");
}

function validate(data: unknown): RouteDraftState["validation"] {
  const result = LegacyRouteFixtureSchema.safeParse(data);
  if (result.success) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: result.error.issues.map(issue => `${issue.path.join(".") || "route"}: ${issue.message}`),
  };
}

function parseRevisions(raw: string | null): NamedRouteRevision[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is NamedRouteRevision =>
      typeof item === "object" && item !== null &&
      typeof item.id === "string" && typeof item.name === "string" &&
      typeof item.versionId === "string" && typeof item.createdAt === "string",
    );
  } catch {
    return [];
  }
}

async function readRouteDraftSource(store: VersionedSnapshotStore): Promise<RouteDraftSource> {
  const draftPointer = await store.readActiveVersion(DATASET_ROUTE_DRAFT);
  if (draftPointer) {
    return {
      versionId: draftPointer.versionId,
      raw: await store.readVersion(DATASET_ROUTE_DRAFT, draftPointer.versionId),
      source: "draft",
    };
  }
  const publishedPointer = await store.readActiveVersion("santa-route");
  if (!publishedPointer) return { versionId: null, raw: null, source: "empty" };
  return {
    versionId: publishedPointer.versionId,
    raw: await store.readVersion("santa-route", publishedPointer.versionId),
    source: "published",
  };
}

function parseDraftEnvelope(raw: string | null): DraftEnvelope | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("data" in value) || !("savedAt" in value)) return null;
    if (typeof value.savedAt !== "string") return null;
    return { data: value.data, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

function requireRevisionEnvelope(raw: string | null): DraftEnvelope {
  const envelope = parseDraftEnvelope(raw);
  if (!envelope) throw Object.assign(new Error("Named revision content is unavailable"), { status: 410 });
  return envelope;
}

function readSourceData(source: RouteDraftSource, envelope: DraftEnvelope | null): unknown {
  if (envelope) return envelope.data;
  if (source.source !== "published" || !source.raw) return null;
  try { return JSON.parse(source.raw) as unknown; }
  catch { return null; }
}

function makeRouteDraftState(source: RouteDraftSource): RouteDraftState {
  const envelope = parseDraftEnvelope(source.raw);
  const data = readSourceData(source, envelope);
  return {
    versionId: source.versionId,
    etag: etagFor(source.versionId, source.source),
    data,
    savedAt: envelope?.savedAt ?? null,
    validation: validate(data),
    source: source.source,
  };
}

export function createRouteDraftService(store: VersionedSnapshotStore, readManifest: () => Promise<string | null>, writeManifest: (body: string) => Promise<void>, lock: <T>(fn: () => Promise<T>) => Promise<T> = fn => fn()): RouteDraftService {
  async function readState(): Promise<RouteDraftState> {
    return makeRouteDraftState(await readRouteDraftSource(store));
  }

  function ensureFresh(expectedEtag: string, current: RouteDraftState): void {
    if (normalizeEtag(expectedEtag) !== normalizeEtag(current.etag)) {
      throw Object.assign(new Error("Draft changed since it was read"), { status: 412, current });
    }
  }

  async function readRevisions(): Promise<NamedRouteRevision[]> {
    return parseRevisions(await readManifest());
  }

  return {
    getState: readState,

    async save(data, expectedEtag) {
      return lock(async () => {
        const current = await readState();
        ensureFresh(expectedEtag, current);
        const envelope: DraftEnvelope = { data, savedAt: new Date().toISOString() };
        const version = await store.saveNewVersion(DATASET_ROUTE_DRAFT, JSON.stringify(envelope));
        await store.activateVersion(DATASET_ROUTE_DRAFT, version.versionId);
        return readState();
      });
    },

    async listRevisions() { return readRevisions(); },

    async compareRevisions(leftId, rightId) {
      const revisions = await readRevisions();
      const left = revisions.find(item => item.id === leftId);
      const right = revisions.find(item => item.id === rightId);
      if (!left || !right) throw Object.assign(new Error("Named revision not found"), { status: 404 });
      const [leftRaw, rightRaw] = await Promise.all([
        store.readVersion(DATASET_ROUTE_DRAFT, left.versionId),
        store.readVersion(DATASET_ROUTE_DRAFT, right.versionId),
      ]);
      const leftEnvelope = requireRevisionEnvelope(leftRaw);
      const rightEnvelope = requireRevisionEnvelope(rightRaw);
      return {
        left, right,
        leftData: leftEnvelope.data,
        rightData: rightEnvelope.data,
      };
    },

    async createRevision(name, expectedEtag) {
      return lock(async () => {
        const current = await readState();
        ensureFresh(expectedEtag, current);
        if (current.source !== "draft" || !current.versionId) {
          throw Object.assign(new Error("Save a draft before creating a named revision"), { status: 409 });
        }
        const existing = await readRevisions();
        const revision: NamedRouteRevision = {
          id: crypto.randomUUID(), name: name.trim(), versionId: current.versionId, createdAt: new Date().toISOString(),
        };
        await writeManifest(JSON.stringify([...existing, revision]));
        return revision;
      });
    },

    async restoreRevision(revisionId, expectedEtag) {
      return lock(async () => {
        const current = await readState();
        ensureFresh(expectedEtag, current);
        const revision = (await readRevisions()).find(item => item.id === revisionId);
        if (!revision) throw Object.assign(new Error("Named revision not found"), { status: 404 });
        const raw = await store.readVersion(DATASET_ROUTE_DRAFT, revision.versionId);
        const envelope = requireRevisionEnvelope(raw);
        const version = await store.saveNewVersion(DATASET_ROUTE_DRAFT, JSON.stringify({ ...envelope, savedAt: new Date().toISOString() }));
        await store.activateVersion(DATASET_ROUTE_DRAFT, version.versionId);
        return readState();
      });
    },
  };
}

export function getRouteDraftService(): RouteDraftService {
  const bucket = getSantaSnapshotsBucket();
  const store = getSnapshotStore(bucket);
  const kv = getKeyValueStore(bucket);
  return createRouteDraftService(store, () => kv.read(REVISIONS_KEY), body => kv.write(REVISIONS_KEY, body), withWriteLock);
}
