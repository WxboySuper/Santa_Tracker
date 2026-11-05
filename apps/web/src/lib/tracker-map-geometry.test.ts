import { describe, expect, it } from "vitest";
import { positionToView, splitGreatCircle } from "./tracker-map-geometry";

describe("splitGreatCircle", () => {
  it.each([
    [{ lat: 10, lng: 170 }, { lat: 20, lng: -170 }],
    [{ lat: 20, lng: -170 }, { lat: 10, lng: 170 }],
    [{ lat: 0, lng: -170 }, { lat: 0, lng: 180 }],
    [{ lat: 90, lng: 180 }, { lat: 55, lng: -160 }],
  ])("never draws across the date line from %o to %o", (start, end) => {
    const segments = splitGreatCircle(start, end);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i]!.lng - segment[i - 1]!.lng)).toBeLessThanOrEqual(180);
      }
    }
  });
});

it("maps longitude first and clamps the poles for the map projection", () => {
  expect(positionToView({ lat: 90, lng: 180 })).toEqual([180, 85.05112878]);
  expect(positionToView({ lat: -90, lng: -42 })).toEqual([-42, -85.05112878]);
  expect(positionToView({ lat: 10, lng: 20 })).toEqual([20, 10]);
});
