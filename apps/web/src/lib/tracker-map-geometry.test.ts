import { describe, expect, it, vi } from "vitest";
import { applyInitialCamera, bearingBetween, hasValidMapExtent, positionToView, splitGreatCircle } from "./tracker-map-geometry";

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

it("centers Santa when a live position exists and fits the route otherwise", () => {
  const camera = { centerOnSanta: vi.fn(), fitRoute: vi.fn() };
  applyInitialCamera(true, camera);
  expect(camera.centerOnSanta).toHaveBeenCalledOnce();
  expect(camera.fitRoute).not.toHaveBeenCalled();
  camera.centerOnSanta.mockClear();
  applyInitialCamera(false, camera);
  expect(camera.fitRoute).toHaveBeenCalledOnce();
  expect(camera.centerOnSanta).not.toHaveBeenCalled();
});

it("rejects empty map extents before fitting", () => {
  expect(hasValidMapExtent([0, 0, 10, 10])).toBe(true);
  expect(hasValidMapExtent([Infinity, Infinity, -Infinity, -Infinity])).toBe(false);
});

describe("bearingBetween", () => {
  it.each([
    [{ lat: 0, lng: 0 }, { lat: 10, lng: 0 }, 0],
    [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, Math.PI / 2],
    [{ lat: 10, lng: 0 }, { lat: 0, lng: 0 }, Math.PI],
    [{ lat: 0, lng: 10 }, { lat: 0, lng: 0 }, -Math.PI / 2],
  ])("points the right way from %o to %o", (from, to, expected) => {
    expect(bearingBetween(from, to)).toBeCloseTo(expected, 5);
  });
});
