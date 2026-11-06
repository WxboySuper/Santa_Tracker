import { describe, expect, it } from "vitest";
import { validRouteNodes } from "./tracker-route-validation";

describe("validRouteNodes", () => {
  it("filters malformed nodes before tracker calculations", () => {
    const valid = { id: "stop-a", type: "DELIVERY", location: { name: "A", lat: 12, lng: 24 } };
    expect(validRouteNodes([{ id: "broken" }, valid])).toEqual([valid]);
  });

  it("rejects a route with no usable nodes", () => {
    expect(() => validRouteNodes([{ id: "broken" }])).toThrow("Invalid route");
    expect(() => validRouteNodes(null)).toThrow("Invalid route");
  });
});
