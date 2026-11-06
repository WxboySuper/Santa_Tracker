import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { haversineKm } from '../geo';

type GeneratedNode = {
  location: { lat: number; lng: number };
  comment: string;
  schedule: { arrival_utc: string; departure_utc: string };
};

describe('route:generate integration', () => {
  it('generates the full 2026 seed under the configured leg ceiling and exact quotas', async () => {
    execSync('pnpm route:generate -- --seed 2026', { stdio: 'pipe' });
    const document = JSON.parse(await readFile('tools/route-generator/out/santa_route.json', 'utf8')) as { route_nodes: GeneratedNode[] };
    const nodes = document.route_nodes;
    const speedLimit = 25_000;
    const maxSpeed = Math.max(...nodes.slice(1).map((node, index) => {
      const prior = nodes[index];
      if (!prior) throw new Error('Missing prior route node');
      const distanceKm = haversineKm(prior.location, node.location);
      const travelHours = (Date.parse(node.schedule.arrival_utc) - Date.parse(prior.schedule.departure_utc)) / 3_600_000;
      return distanceKm / travelHours;
    }));
    const categoryCounts = nodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.comment] = (counts[node.comment] ?? 0) + 1;
      return counts;
    }, {});

    expect(nodes).toHaveLength(160);
    expect(maxSpeed).toBeLessThanOrEqual(speedLimit);
    expect(categoryCounts).toEqual({ hub: 48, cultural: 40, underserved: 32, nature: 24, special: 16 });
  }, 30_000);
});
