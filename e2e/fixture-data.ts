import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ServerName = "closed" | "open";
type Calendar = { days: { day: number; is_unlocked_override?: boolean }[] };

function parseCalendar(source: string, filePath: string): Calendar {
  try {
    return JSON.parse(source) as Calendar;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse Advent calendar at ${filePath}: ${reason}`, { cause: error });
  }
}

async function writeServerData(name: ServerName, root: string, route: string, originalCalendar: Calendar): Promise<string> {
  const dataRoot = path.join(root, name);
  await mkdir(dataRoot, { recursive: true });
  const calendar = JSON.parse(JSON.stringify(originalCalendar)) as Calendar;
  if (name === "open") {
    const firstDay = calendar.days.find((day) => day.day === 1);
    if (!firstDay) throw new Error("The advent calendar must include day 1");
    firstDay.is_unlocked_override = true;
  }
  await Promise.all([
    writeFile(path.join(dataRoot, "santa_route.json"), route),
    writeFile(path.join(dataRoot, "advent_calendar.json"), JSON.stringify(calendar, null, 2)),
  ]);
  return dataRoot;
}

export async function prepareFixtureData(source: string, temporaryRoot: string): Promise<Record<ServerName, string>> {
  const [route, rawCalendar] = await Promise.all([
    readFile(path.join(source, "santa_route.json"), "utf8"),
    readFile(path.join(source, "advent_calendar.json"), "utf8"),
  ]);
  const calendar = parseCalendar(rawCalendar, path.join(source, "advent_calendar.json"));
  const [closed, open] = await Promise.all([
    writeServerData("closed", temporaryRoot, route, calendar),
    writeServerData("open", temporaryRoot, route, calendar),
  ]);
  return { closed, open };
}
