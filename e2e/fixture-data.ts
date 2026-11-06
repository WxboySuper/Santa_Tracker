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

/** Copies route times into a live window so browser tests see a journey in progress. */
function shiftRouteToLiveWindow(route: string): string {
	const parsed: unknown = JSON.parse(route);
	if (!isSantaRoute(parsed)) throw new Error("Expected route metadata and route_nodes");
  const nodes = (parsed as { route_nodes: { schedule?: unknown }[] }).route_nodes;
	const shift = liveWindowShift(nodes);
	if (shift === null) throw new Error("Cannot center route: fewer than two valid schedule timestamps");
	for (const node of nodes) shiftNodeTimes(node, shift);
	return JSON.stringify(parsed);
}

/** Returns a shift that centers the route schedule on the current time. */
function liveWindowShift(nodes: { schedule?: unknown }[]): number | null {
	let minimum = Infinity;
	let maximum = -Infinity;
	let count = 0;
	for (const node of nodes) {
		if (!isRecord(node.schedule)) continue;
		for (const key of ["arrival_utc", "departure_utc"] as const) {
			const candidate = node.schedule[key];
			if (typeof candidate !== "string") continue;
			const time = Date.parse(candidate);
			if (!Number.isFinite(time)) continue;
			minimum = Math.min(minimum, time);
			maximum = Math.max(maximum, time);
			count++;
		}
	}
	if (count < 2) return null;
	return Date.now() - (minimum + (maximum - minimum) / 2);
}

/** Moves a route node's arrival and departure by the same interval. */
function shiftNodeTimes(node: { schedule?: unknown }, shift: number): void {
	const schedule = node.schedule;
	if (!isRecord(schedule)) return;
	for (const key of ["arrival_utc", "departure_utc"] as const) {
		const value = schedule[key];
		if (typeof value !== "string") continue;
		const parsed = Date.parse(value);
		if (!Number.isFinite(parsed)) continue;
		schedule[key] = new Date(parsed + shift).toISOString();
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
	const closedRoute = sourceRoute;
	const openRoute = shiftRouteToLiveWindow(sourceRoute);
  const calendar = parseCalendar({ content: rawCalendar, path: getCalendarPath(source) });
  const [closed, open] = await Promise.all([
    writeServerData("closed", temporaryRoot, closedRoute, calendar),
    writeServerData("open", temporaryRoot, openRoute, calendar),
  ]);
  return { closed, open };
}
