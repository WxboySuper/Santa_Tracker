import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function isHighImpactOrUnclassified(impact: string | null | undefined): boolean {
  if (impact === null) return true;
  if (impact === undefined) return true;
  return ["serious", "critical"].includes(impact);
}

export async function expectNoSeriousAxeIssues(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const issues = result.violations.filter((violation) => isHighImpactOrUnclassified(violation.impact));
  const summary = issues.slice(0, 5).map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    violationCount: nodes.length,
    targets: nodes.slice(0, 3).map(({ target }) => target),
  }));
  expect(issues, JSON.stringify(summary, null, 2)).toEqual([]);
}
