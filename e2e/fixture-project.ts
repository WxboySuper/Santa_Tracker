import { isRecord } from "./validation";

const fixtureProjectNames = new Map<unknown, string>([["closed", "closed"], ["open", "open"]]);

export function getFixtureProjectName(project: { name: string; metadata?: unknown }): string {
  const metadata = project.metadata;
  if (!isRecord(metadata)) return project.name;
  if (!("fixtureProject" in metadata)) return project.name;

  const fixtureProject = metadata.fixtureProject;
  const fixtureProjectName = fixtureProjectNames.get(fixtureProject);
  if (fixtureProjectName) return fixtureProjectName;
  throw new Error(`Unknown fixtureProject for project ${project.name}: ${String(fixtureProject)}`);
}
