export function getFixtureProjectName(project: { name: string; metadata?: unknown }): string {
  const metadata = project.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !("fixtureProject" in metadata)) {
    return project.name;
  }

  const fixtureProject = metadata.fixtureProject;
  if (fixtureProject === "closed" || fixtureProject === "open") return fixtureProject;
  throw new Error(`Unknown fixtureProject for project ${project.name}: ${String(fixtureProject)}`);
}
