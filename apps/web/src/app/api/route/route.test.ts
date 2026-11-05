import { beforeEach, describe, expect, it, vi } from "vitest";
import { featureAccess } from "@/lib/access";
import { loadRouteNodesRaw } from "@/lib/locations";
import { dynamic, GET } from "./route";

vi.mock("@/lib/access", () => ({
  featureAccess: vi.fn(),
  closedResponse: () => new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Cache-Control": "private, no-store" } }),
}));
vi.mock("@/lib/locations", () => ({ loadRouteNodesRaw: vi.fn() }));

const request = () => new Request("https://example.test/api/route");

describe("route API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRouteNodesRaw).mockResolvedValue([{ id: "a" }] as never);
  });

  it("is never prerendered or statically optimized", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("serves the route with a shared-cache header when the tracker is open", async () => {
    vi.mocked(featureAccess).mockResolvedValue("open");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(await response.json()).toEqual({ route_nodes: [{ id: "a" }] });
  });

  it("serves an admin preview as private no-store so it cannot reach visitors", async () => {
    vi.mocked(featureAccess).mockResolvedValue("admin");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers a closed gate with an uncacheable 404 and never reads the route", async () => {
    vi.mocked(featureAccess).mockResolvedValue("closed");
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(loadRouteNodesRaw).not.toHaveBeenCalled();
  });

  it.each(["open", "admin"] as const)("never caches the error 404 (access=%s)", async (access) => {
    vi.mocked(featureAccess).mockResolvedValue(access);
    vi.mocked(loadRouteNodesRaw).mockRejectedValue(new Error("store unavailable"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(logError).toHaveBeenCalledWith("Santa route error", expect.any(Error));
    logError.mockRestore();
  });
});
