import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdminAuth } from "@/lib/auth";
import { replaceEmergencyControls } from "@/lib/emergency-controls";
import { PUT } from "./route";

vi.mock("@/lib/auth", () => ({ requireAdminAuth: vi.fn() }));
vi.mock("@/lib/emergency-controls", () => ({ replaceEmergencyControls: vi.fn() }));

describe("PUT /api/admin/emergency-controls", () => {
  beforeEach(() => {
    vi.mocked(requireAdminAuth).mockResolvedValue({ ok: true });
    vi.mocked(replaceEmergencyControls).mockResolvedValue(null);
  });

  it("rejects an oversized streamed body when Content-Length is absent", async () => {
    const request = new Request("https://example.test/api/admin/emergency-controls", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '""' },
      body: `{"data":"${"x".repeat(2_100)}"}`,
    });

    const response = await PUT(request);

    expect(response.status).toBe(413);
    expect(replaceEmergencyControls).not.toHaveBeenCalled();
  });

  it("returns stale-write feedback when the ETag no longer matches", async () => {
    const request = new Request("https://example.test/api/admin/emergency-controls", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"old"' },
      body: JSON.stringify({
        noMap: true,
        simplifiedTracker: false,
        killedFeatures: { weather: true, soundscape: false },
        reason: "Provider outage",
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(412);
    expect(replaceEmergencyControls).toHaveBeenCalledOnce();
  });
});
