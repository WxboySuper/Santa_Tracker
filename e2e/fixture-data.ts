import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerName } from "./types";
import { closeCalendar, getCalendarPath, openFirstDay, parseCalendar, type Calendar } from "./calendar-validation";
import { isRecord } from "./validation";
type FixtureDataSource = { source: string; temporaryRoot: string };

function isSantaRoute(value: unknown): boolean {
	if (!isRecord(value) || !isRecord(value.meta)) return false;
	if (!Array.isArray(value.route_nodes) || value.route_nodes.length === 0) return false;
	return value.route_nodes.every(isRecord);
}

function shiftRouteToLiveWindow(route: string): string {
	const parsed: unknown = JSON.parse(route);
	if (!isSantaRoute(parsed)) return route;
	const nodes = (parsed as { route_nodes: { schedule?: Record<string, unknown> }[] }).route_nodes;
	const shift = liveWindowShift(nodes);
	if (shift == null) return route;
	for (const node of nodes) shiftNodeTimes(node, shift);
	return JSON.stringify(parsed);
}

function liveWindowShift(nodes: { schedule?: Record<string, unknown> }[]): number | null {
	const times = nodes.flatMap(node => [node.schedule?.arrival_utc, node.schedule?.departure_utc])
		.filter((value): value is string => typeof value === "string")
		.map(Date.parse).filter(Number.isFinite);
	if (times.length < 2) return null;
	return Date.now() - (Math.min(...times) + (Math.max(...times) - Math.min(...times)) / 2);
}

function shiftNodeTimes(node: { schedule?: Record<string, unknown> }, shift: number): void {
	const schedule = node.schedule;
	if (!schedule) return;
	for (const key of ["arrival_utc", "departure_utc"] as const) {
		const value = schedule[key];
		if (typeof value === "string") schedule[key] = new Date(Date.parse(value) + shift).toISOString();
	}
}

async function writeServerData(name: ServerName, root: string, route: string, calendar: Calendar): Promise<string> {
  const dataRoot = path.join(root, name);
  await mkdir(dataRoot, { recursive: true });
  const serverCalendar = name === "closed" ? closeCalendar(calendar) : openFirstDay(calendar);
  await Promise.all([
    writeFile(path.join(dataRoot, "santa_route.json"), route),
    writeFile(getCalendarPath(dataRoot), JSON.stringify(serverCalendar, null, 2)),
  ]);
  return dataRoot;
}

export async function prepareFixtureData({ source, temporaryRoot }: FixtureDataSource): Promise<Record<ServerName, string>> {
  const [sourceRoute, rawCalendar] = await Promise.all([
    readFile(path.join(source, "santa_route.json"), "utf8"),
    readFile(path.join(source, "advent_calendar.json"), "utf8"),
  ]);
  const routePath = path.join(source, "santa_route.json");
  try {
		const parsed: unknown = JSON.parse(sourceRoute);
		if (!isSantaRoute(parsed)) throw new Error("Expected route metadata and route_nodes");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not validate Santa route at ${routePath}: ${reason}`, { cause: error });
  }
	const route = shiftRouteToLiveWindow(sourceRoute);
  const calendar = parseCalendar({ content: rawCalendar, path: getCalendarPath(source) });
  const [closed, open] = await Promise.all([
    writeServerData("closed", temporaryRoot, route, calendar),
    writeServerData("open", temporaryRoot, route, calendar),
  ]);
  return { closed, open };
}
