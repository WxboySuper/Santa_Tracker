import { describe, expect, it } from "vitest";
import { readCappedJson } from "./admin-json";

describe("readCappedJson", () => {
  it("rejects non-JSON requests", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "{}" });
    await expect(readCappedJson(request, 100)).resolves.toMatchObject({ ok: false, status: 415 });
  });

  it("enforces the limit while reading a body without Content-Length", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(200) }),
    });
    expect(request.headers.has("content-length")).toBe(false);
    await expect(readCappedJson(request, 100)).resolves.toMatchObject({ ok: false, status: 413 });
  });

  it("returns parsed JSON within the limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "checkpoint" }),
    });
    await expect(readCappedJson(request, 100)).resolves.toMatchObject({ ok: true, value: { name: "checkpoint" } });
  });
});
