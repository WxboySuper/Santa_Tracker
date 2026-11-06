import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const axeTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoSeriousAxeIssues(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
  const issues = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  expect(issues, JSON.stringify(issues.map(({ id, impact, description, nodes }) => ({
    id,
    impact,
    description,
    targets: nodes.map((node) => node.target),
  })), null, 2)).toEqual([]);
}
