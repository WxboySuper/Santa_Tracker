import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const routePath = resolve(process.argv[2] ?? 'docs/planning/route-2026-draft/route.json');
const outputDirectory = resolve('docs/planning/route-2026-draft/maps');
const landUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';

function decodeLand(topology) {
  const [scaleX, scaleY] = topology.transform.scale;
  const [translateX, translateY] = topology.transform.translate;
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scaleX + translateX, y * scaleY + translateY];
    });
  });
  const getArc = (index) => index < 0 ? [...arcs[~index]].reverse() : arcs[index];
  const rings = [];
  const geometries = topology.objects.land.type === 'GeometryCollection'
    ? topology.objects.land.geometries
    : [topology.objects.land];
  for (const geometry of geometries) {
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const points = ring.flatMap((index, arcIndex) => getArc(index).slice(arcIndex ? 1 : 0));
        if (points.length > 2) rings.push(points);
      }
    }
  }
  return rings;
}

function formatNumber(value) {
  return Number(value.toFixed(2));
}

function mapPath(rings, project) {
  return rings.map((ring) => ring.map(([lng, lat], index) => {
    const [x, y] = project(lng, lat);
    return `${index === 0 ? 'M' : 'L'}${formatNumber(x)},${formatNumber(y)}`;
  }).join(' ') + ' Z').join(' ');
}

function routeLegs(nodes, view) {
  const segments = [];
  for (let index = 1; index < nodes.length; index++) {
    const from = nodes[index - 1]?.location;
    const to = nodes[index]?.location;
    if (!from || !to || typeof from.lat !== 'number' || typeof to.lat !== 'number') continue;
    const start = { lng: from.lng ?? 180, lat: from.lat };
    const end = { lng: to.lng ?? 180, lat: to.lat };
    const middle = { lng: (start.lng + end.lng) / 2, lat: (start.lat + end.lat) / 2 };
    if (view.crop && ![start, end, middle].some(({ lng, lat }) => lng >= view.crop.minLng && lng <= view.crop.maxLng
      && lat >= view.crop.minLat && lat <= view.crop.maxLat)) continue;

    const delta = end.lng - start.lng;
    if (Math.abs(delta) <= 180) {
      segments.push(`<path class="leg" d="M${formatPoint(projectPoint(start, view))} L${formatPoint(projectPoint(end, view))}" marker-end="url(#arrow)"/>`);
      continue;
    }
    const adjustedEnd = { ...end, lng: end.lng + (delta > 0 ? -360 : 360) };
    const edge = delta > 0 ? -180 : 180;
    const ratio = (edge - start.lng) / (adjustedEnd.lng - start.lng);
    const seamLat = start.lat + (end.lat - start.lat) * ratio;
    const seamStart = projectPoint({ lng: edge, lat: seamLat }, view);
    const seamEnd = projectPoint({ lng: -edge, lat: seamLat }, view);
    segments.push(`<path class="leg" d="M${formatPoint(projectPoint(start, view))} L${formatPoint(seamStart)}"/>`);
    segments.push(`<path class="leg" d="M${formatPoint(seamEnd)} L${formatPoint(projectPoint(end, view))}" marker-end="url(#arrow)"/>`);
  }
  return segments.join('');
}

function formatPoint(point) {
  return `${formatNumber(point[0])},${formatNumber(point[1])}`;
}

function projectPoint(point, view) {
  return view.project(point.lng, point.lat);
}

function svgForRoute(nodes, landRings, view, title, subtitle) {
  const land = mapPath(landRings, view.project);
  const legs = routeLegs(nodes, view);
  const stops = nodes.filter((node) => node.type === 'DELIVERY' && typeof node.location?.lat === 'number')
    .map((node, index) => {
      const [x, y] = view.project(node.location.lng ?? 0, node.location.lat);
      return `<circle class="stop" cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="${index % 25 === 0 ? 3.4 : 1.7}"/>`;
    }).join('');
  const grid = [];
  for (let longitude = Math.ceil(view.crop.minLng / 30) * 30; longitude <= view.crop.maxLng; longitude += 30) {
    const [x1, y1] = view.project(longitude, view.crop.minLat);
    const [x2, y2] = view.project(longitude, view.crop.maxLat);
    grid.push(`<path class="grid" d="M${formatNumber(x1)},${formatNumber(y1)} L${formatNumber(x2)},${formatNumber(y2)}"/>`);
  }
  for (let latitude = Math.ceil(view.crop.minLat / 30) * 30; latitude <= view.crop.maxLat; latitude += 30) {
    const [x1, y1] = view.project(view.crop.minLng, latitude);
    const [x2, y2] = view.project(view.crop.maxLng, latitude);
    grid.push(`<path class="grid" d="M${formatNumber(x1)},${formatNumber(y1)} L${formatNumber(x2)},${formatNumber(y2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}">
    <defs>
      <linearGradient id="sea" x2="0" y2="1"><stop stop-color="#061a33"/><stop offset="1" stop-color="#0d3150"/></linearGradient>
      <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.4" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 Z" fill="#ffcf66"/></marker>
      <clipPath id="map"><rect x="${view.left}" y="${view.top}" width="${view.mapWidth}" height="${view.mapHeight}" rx="20"/></clipPath>
    </defs>
    <rect width="100%" height="100%" fill="#071526"/>
    <text class="title" x="64" y="64">${title}</text>
    <text class="subtitle" x="66" y="98">${subtitle}</text>
    <g clip-path="url(#map)">
      <rect x="${view.left}" y="${view.top}" width="${view.mapWidth}" height="${view.mapHeight}" fill="url(#sea)"/>
      ${grid.join('')}
      <path class="land" d="${land}"/>
      ${legs}${stops}
    </g>
    <g class="legend" transform="translate(70 ${view.height - 54})"><path d="M0,0 H45" class="leg" marker-end="url(#arrow)"/><text x="60" y="5">Route direction</text><circle class="stop" cx="230" cy="0" r="4"/><text x="243" y="5">Delivery stop</text></g>
    <style>
      text { font-family: Inter, Segoe UI, sans-serif; }
      .title { fill:#f3f7fb; font-size:30px; font-weight:700; letter-spacing:.2px; }
      .subtitle { fill:#9bb2c7; font-size:15px; }
      .grid { stroke:#7290a7; stroke-opacity:.2; stroke-width:1; }
      .land { fill:#a9c2b6; fill-rule:evenodd; stroke:#d1e0d7; stroke-width:.65; stroke-opacity:.55; }
      .leg { fill:none; stroke:#ffcf66; stroke-width:1.4; stroke-opacity:.56; stroke-linecap:round; }
      .stop { fill:#f57562; stroke:#fff2dc; stroke-width:.7; }
      .legend { fill:#dce8f1; font-size:13px; }
    </style>
  </svg>`;
}

function makeView(width, height, crop) {
  const left = 36;
  const top = 130;
  const mapWidth = width - 72;
  const mapHeight = height - 180;
  const scale = Math.min(mapWidth / (crop.maxLng - crop.minLng), mapHeight / (crop.maxLat - crop.minLat));
  const drawnWidth = (crop.maxLng - crop.minLng) * scale;
  const drawnHeight = (crop.maxLat - crop.minLat) * scale;
  const xOffset = left + (mapWidth - drawnWidth) / 2;
  const yOffset = top + (mapHeight - drawnHeight) / 2;
  return {
    width, height, left, top, mapWidth, mapHeight, crop,
    project: (lng, lat) => [xOffset + (lng - crop.minLng) * scale, yOffset + (crop.maxLat - lat) * scale],
  };
}

const route = JSON.parse(await readFile(routePath, 'utf8'));
const topology = await globalThis.fetch(landUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not load world outlines (${response.status})`);
  return response.json();
});
const land = decodeLand(topology);
const browser = await chromium.launch({ headless: true });
try {
  await mkdir(outputDirectory, { recursive: true });
  const page = await browser.newPage();
  const maps = [
    { filename: 'world-route.png', view: makeView(2400, 1300, { minLng: -180, maxLng: 180, minLat: -90, maxLat: 90 }), title: 'Santa’s 2026 World Route', subtitle: `${route.route_nodes.filter((node) => node.type === 'DELIVERY').length} stops · arrows show travel direction` },
    { filename: 'north-america-route.png', view: makeView(1900, 1450, { minLng: -170, maxLng: -48, minLat: 5, maxLat: 84 }), title: 'North America Route Detail', subtitle: 'United States, Canada, Mexico, Central America, and the Caribbean' },
  ];
  for (const map of maps) {
    await page.setContent(svgForRoute(route.route_nodes, land, map.view, map.title, map.subtitle));
    await page.screenshot({ path: resolve(outputDirectory, map.filename) });
  }
} finally {
  await browser.close();
}

globalThis.console.log(`Rendered world-route.png and north-america-route.png from ${routePath}`);
