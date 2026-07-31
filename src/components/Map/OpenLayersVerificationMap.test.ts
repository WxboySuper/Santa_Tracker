/**
 * Unit tests for helper functions in OpenLayersVerificationMap
 * Focus on pure utilities to raise coverage without instantiating a full OL Map.
 */

import { jest } from '@jest/globals';
import React from 'react';

// Mock ol-mapbox-style to avoid loading ESM modules in tests
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock mapStyleUtils used by buildStyle/getVerificationStyleZIndex
jest.mock('../../utils/mapStyleUtils', () => ({
  getFeatureStyle: jest.fn(() => ({
    fillColor: '#112233',
    fillOpacity: 0.5,
    opacity: 0.9,
    color: '#445566',
    weight: 4,
  })),
  computeZIndex: jest.fn(() => 42),
}));

import { createCanvasStub } from '../../testUtils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  toRgbaColor,
  createHatchPattern,
  isFunctionColorNotation,
  coerceNumber,
  resolveFillOpacity,
  resolveStrokeOpacity,
  resolveStrokeWidth,
  isCigProbability,
  getVerificationStyleZIndex,
  buildCigStyleParts,
  createStandardFill,
  createStandardStroke,
  buildStyle,
  replaceLayerGroupLayers,
  createVerifTileSource,
  VerifMapLegendToggleButton,
} from './OpenLayersVerificationMap';

type LayerGroupLike = {
  getLayers: () => {
    clear: () => void;
    push: (layer: unknown) => void;
    getArray?: () => unknown[];
  };
};

describe('OpenLayersVerificationMap helpers', () => {
  let originalCreateElement: typeof document.createElement;

  beforeAll(() => {
    originalCreateElement = document.createElement;
  });

  afterAll(() => {
    document.createElement = originalCreateElement;
  });

  test('toRgbaColor handles empty, hex (3/6), rgb/rgba and invalid values', () => {
    expect(toRgbaColor({ color: '', alpha: 0.5 })).toBe('rgba(255,255,255,0.5)');
    expect(toRgbaColor({ color: 'rgba(1,2,3,0.4)', alpha: 0.4 })).toBe('rgba(1,2,3,0.4)');
    expect(toRgbaColor({ color: 'rgb(4,5,6)', alpha: 0.8 })).toBe('rgb(4,5,6)');
    expect(toRgbaColor({ color: '#fff', alpha: 0.3 })).toBe('rgba(255, 255, 255, 0.3)');
    expect(toRgbaColor({ color: '#12ab34', alpha: 1 })).toBe('rgba(18, 171, 52, 1)');
    // Invalid hex should return original
    expect(toRgbaColor({ color: '#zzz', alpha: 0.2 })).toBe('#zzz');
  });

  test('createHatchPattern returns a pattern when canvas context exists', () => {
    // Stub document.createElement('canvas') to provide a 2D context with createPattern
    document.createElement = createCanvasStub(originalCreateElement);

    const pattern = createHatchPattern('CIG1');
    expect(pattern).toBeTruthy();
  });

  test('isFunctionColorNotation and coerceNumber behave correctly', () => {
    expect(isFunctionColorNotation('rgba(1,2,3,0.4)')).toBe(true);
    expect(isFunctionColorNotation('#123')).toBe(false);
    expect(coerceNumber(5, 2)).toBe(5);
    expect(coerceNumber('a' as unknown as number, 2)).toBe(2);
  });

  test('resolveFill/Stroke opacity and width defaults', () => {
    expect(resolveFillOpacity('categorical', 0.6)).toBe(0.42);
    expect(resolveFillOpacity('categorical', 'x' as unknown)).toBe(0.25);
    expect(resolveStrokeOpacity(0.7)).toBe(0.7);
    expect(resolveStrokeOpacity('y' as unknown)).toBe(1);
    expect(resolveStrokeWidth(4)).toBe(4);
    expect(resolveStrokeWidth('z' as unknown)).toBe(2);
  });

  test('isCigProbability and getVerificationStyleZIndex', () => {
    expect(isCigProbability('CIG1')).toBe(true);
    expect(isCigProbability('P10')).toBe(false);
    // Non-CIG uses computeZIndex mock (42)
    expect(getVerificationStyleZIndex({ outlookType: 'categorical', probability: 'P10' })).toBe(42);
    // CIG returns 1000 + rank
    expect(getVerificationStyleZIndex({ outlookType: 'categorical', probability: 'CIG3' })).toBe(1003);
  });

  test('buildCigStyleParts returns fill and stroke', () => {
    // Stub canvas for pattern
    document.createElement = createCanvasStub(originalCreateElement);

    const parts = buildCigStyleParts('CIG2');
    expect(parts.fill).toBeTruthy();
    expect(parts.stroke).toBeTruthy();
  });

  test('createStandardFill/createStandardStroke return style objects', () => {
    const fillStyle = createStandardFill({ color: '#123456', alpha: 0.5 });
    const strokeStyle = createStandardStroke({ color: '#abcdef', opacity: 0.6, width: 3 });
    expect(fillStyle).toBeTruthy();
    expect(strokeStyle).toBeTruthy();
  });

  test('buildStyle returns an OpenLayers Style object for CIG and non-CIG', () => {
    const s1: unknown = buildStyle({ outlookType: 'categorical', probability: 'P10' });
    expect(s1).toBeTruthy();
    // For CIG probability
    // Stub canvas for pattern used by CIG branch
    document.createElement = createCanvasStub(originalCreateElement);

    const s2: unknown = buildStyle({ outlookType: 'categorical', probability: 'CIG1' });
    expect(s2).toBeTruthy();
  });

  test('replaceLayerGroupLayers copies layers from source to target via layer containers', () => {
    const pushed: unknown[] = [];
    const target: LayerGroupLike = { getLayers: () => ({ clear: () => { pushed.length = 0; }, push: (layer: unknown) => pushed.push(layer) }) };
    const source: LayerGroupLike = { getLayers: () => ({ clear: () => undefined, push: () => undefined, getArray: () => ['a', 'b'] }) };
    replaceLayerGroupLayers(target as never, source as never);
    expect(pushed).toEqual(['a', 'b']);
  });

  test('createVerifTileSource returns a source for known styles', () => {
    const tileSource = createVerifTileSource('osm');
    expect(tileSource).toBeTruthy();
  });
});

describe('verification map legend toggle', () => {
  test('toggles the mobile key state and exposes its expanded state', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    const { rerender } = render(React.createElement(VerifMapLegendToggleButton, { mobileOpen: false, onToggle }));
    const button = screen.getByRole('button', { name: 'Show map key' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'map-legend');
    expect(button).toHaveClass('map-legend-toggle-button');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(React.createElement(VerifMapLegendToggleButton, { mobileOpen: true, onToggle }));
    expect(screen.getByRole('button', { name: 'Hide map key' })).toHaveAttribute('aria-expanded', 'true');
  });
});
