import { describe, expect, it } from "vitest";
import { createVersionedSnapshotStore, type VersionedStoreBackend } from "./storage/versioned-store-core";
import { createRouteDraftService } from "./route-drafts";

function makeFixture(name = "Auckland") {
  return {
    meta: { year: 2026, route_version: "draft", generated_at: "2026-11-26T00:00:00.000Z" },
    route_nodes: [{
      id: "north_pole",
      type: "stop",
      location: { name, region: "New Zealand", lat: -36.85, lng: 174.76, timezone_offset: 13 },
      stop_experience: {},
      schedule: {},
      transit_to_here: null,
    }],
  };
}

function setup() {
  const files = new Map<string, string>();
  let lastLock: Promise<void> = Promise.resolve();
  const backend: VersionedStoreBackend = {
    async read(key) { return files.get(key) ?? null; },
    async write(key, body) { files.set(key, body); },
    async delete(key) { return files.delete(key); },
    async list(prefix) { return [...files.keys()].filter(key => key.startsWith(prefix)); },
  };
  let manifest: string | null = null;
  const store = createVersionedSnapshotStore(backend);
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = lastLock;
    let release!: () => void;
    lastLock = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await fn(); }
    finally { release(); }
  }
  const service = createRouteDraftService(
    store,
    async () => manifest,
    async body => { manifest = body; },
    withLock,
  );
  return { files, store, service };
}

describe("route draft revisions", () => {
  it("autosaves into the isolated draft dataset and rejects stale writes", async () => {
    const { store, service } = setup();
    const published = await store.saveNewVersion("santa-route", JSON.stringify(makeFixture("Published")));
    await store.activateVersion("santa-route", published.versionId);

    const initial = await service.getState();
    expect(initial.source).toBe("published");
    expect((initial.data as ReturnType<typeof makeFixture>).route_nodes[0]!.location.name).toBe("Published");

    const saved = await service.save(makeFixture("Draft"), initial.etag);
    expect(saved.source).toBe("draft");
    expect(saved.validation.valid).toBe(true);
    const publishedRaw = await store.readActive("santa-route");
    expect(JSON.parse(publishedRaw!).route_nodes[0].location.name).toBe("Published");
    expect(JSON.parse((await store.readActive("santa-route-draft"))!).data.route_nodes[0].location.name).toBe("Draft");
    await expect(service.save(makeFixture("Stale"), initial.etag)).rejects.toMatchObject({ status: 412 });
  });

  it("compares named restore points and restores as a new draft version", async () => {
    const { service } = setup();
    const empty = await service.getState();
    const first = await service.save(makeFixture("First"), empty.etag);
    const namedFirst = await service.createRevision("Before edit", first.etag);
    const second = await service.save(makeFixture("Second"), first.etag);
    const namedSecond = await service.createRevision("After edit", second.etag);

    const comparison = await service.compareRevisions(namedFirst.id, namedSecond.id);
    expect((comparison.leftData as ReturnType<typeof makeFixture>).route_nodes[0]!.location.name).toBe("First");
    expect((comparison.rightData as ReturnType<typeof makeFixture>).route_nodes[0]!.location.name).toBe("Second");

    const restored = await service.restoreRevision(namedFirst.id, second.etag);
    expect(restored.source).toBe("draft");
    expect(restored.versionId).not.toBe(namedFirst.versionId);
    expect((restored.data as ReturnType<typeof makeFixture>).route_nodes[0]!.location.name).toBe("First");
  });

  it("saves incomplete autosaves with validation feedback", async () => {
    const { service } = setup();
    const empty = await service.getState();
    const saved = await service.save({ route_nodes: [] }, empty.etag);
    expect(saved.source).toBe("draft");
    expect(saved.validation.valid).toBe(false);
    expect(saved.validation.issues.length).toBeGreaterThan(0);
  });

  it("allows only one concurrent save for the same revision token", async () => {
    const { service } = setup();
    const initial = await service.getState();
    const results = await Promise.allSettled([
      service.save(makeFixture("First concurrent save"), initial.etag),
      service.save(makeFixture("Second concurrent save"), initial.etag),
    ]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { status: 412 } });
  });

  it("reports corrupt immutable revision content as unavailable", async () => {
    const { files, service } = setup();
    const initial = await service.getState();
    const saved = await service.save(makeFixture("Saved"), initial.etag);
    const revision = await service.createRevision("Saved point", saved.etag);
    files.set(`santa-route-draft/versions/${revision.versionId}.json`, "not-json");

    await expect(service.compareRevisions(revision.id, revision.id)).rejects.toMatchObject({ status: 410 });
    await expect(service.restoreRevision(revision.id, saved.etag)).rejects.toMatchObject({ status: 410 });
  });
});
