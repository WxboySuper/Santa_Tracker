import { describe, expect, it } from "vitest";
import { dynamic, GET } from "./route";

describe("time API", () => {
  it("is dynamic and returns a fresh timestamp with no-store caching", async () => {
    expect(dynamic).toBe("force-dynamic");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json() as { serverTime: string };
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });
});
