import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health endpoint", () => {
  it("returns a public, uncached health response without exposing runtime details", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
