import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerName } from "./types";
import { closeCalendar, getCalendarPath, openFirstDay, parseCalendar, type Calendar } from "./calendar-validation";
type FixtureDataSource = { source: string; temporaryRoot: string };

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
  const [route, rawCalendar] = await Promise.all([
    readFile(path.join(source, "santa_route.json"), "utf8"),
    readFile(path.join(source, "advent_calendar.json"), "utf8"),
  ]);
  const routePath = path.join(source, "santa_route.json");
  try {
    JSON.parse(route);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse Santa route at ${routePath}: ${reason}`, { cause: error });
  }
  const calendar = parseCalendar({ content: rawCalendar, path: getCalendarPath(source) });
  const [closed, open] = await Promise.all([
    writeServerData("closed", temporaryRoot, route, calendar),
    writeServerData("open", temporaryRoot, route, calendar),
  ]);
  return { closed, open };
}
