import type { Page } from "@playwright/test";

export async function adminMutation(
  page: Page,
  input: { path: string; method: string; data?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: string }> {
  return page.evaluate(async ({ path, method, data, headers }) => {
    const csrf = document.cookie.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("admin_csrf="))?.slice("admin_csrf=".length);
    if (!csrf) throw new Error("Admin login did not set the CSRF cookie");
    const response = await fetch(path, {
      method,
      credentials: "include",
      headers: { ...headers, "X-CSRF-Token": decodeURIComponent(csrf), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.text() };
  }, input);
}
