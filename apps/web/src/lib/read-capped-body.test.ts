import { describe, expect, it } from "vitest";
import { readCappedBody } from "./read-capped-body";

describe("readCappedBody", () => {
  it("caps streamed bytes without relying on a Content-Length header", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "x".repeat(2_049) });

    expect(request.headers.get("content-length")).toBeNull();
    await expect(readCappedBody(request.body, 2_048)).resolves.toEqual({ kind: "too-large" });
  });

  it("returns the complete body when it fits the cap", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "hello" });

    const result = await readCappedBody(request.body, 5);

    expect(result.kind).toBe("bytes");
    if (result.kind === "bytes") expect(new TextDecoder().decode(result.value)).toBe("hello");
  });
});
