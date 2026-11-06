import { expect, test, getRuntimeConfig } from "./fixtures";
import { expectNoSeriousAxeIssues } from "./axe-check";

const gatedPaths = ["/tracker", "/advent", "/advent/1", "/api/route", "/api/advent/manifest"];

async function getAdminPassword(): Promise<string> {
  const runtimeFile = process.env.E2E_RUNTIME_FILE;
  if (!runtimeFile) throw new Error("E2E_RUNTIME_FILE is not configured");
  return (await getRuntimeConfig(runtimeFile)).adminPassword;
}

function expectClosedCacheHeaders(route: string, cacheControl: string | undefined) {
  expect(cacheControl, route).toContain("no-store");
  if (route.startsWith("/api/")) expect(cacheControl).toContain("private");
}

test("closed season gates pages and APIs, including malformed credentials", async ({ page, request }) => {
  const loginPassword = await getAdminPassword();
  for (const route of gatedPaths) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
    expectClosedCacheHeaders(route, response.headers()["cache-control"]);
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: /track santa/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /tracker|village/i })).toHaveCount(0);

  const forged = await request.get("/advent", { headers: { cookie: "admin_token=forged-token" } });
  expect(forged.status()).toBe(404);
  const malformed = await request.get("/advent", { headers: { cookie: "admin_token=%" } });
  expect(malformed.status()).toBe(404);
  const login = await request.post("/api/admin/login", { data: { password: loginPassword } });
  expect(login.status()).toBe(200);
  for (const route of gatedPaths) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
  }
  const routeResponse = await request.get("/api/route");
  expect(routeResponse.headers()["cache-control"]).toBe("private, no-store");
});

test("accessible Advent calendar in the closed project matches axe", async ({ page }) => {
  const loginPassword = await getAdminPassword();
  const login = await page.request.post("/api/admin/login", { data: { password: loginPassword } });
  expect(login.status()).toBe(200);
  await page.goto("/advent");
  await expect(page.getByRole("listitem")).toHaveCount(24);
  await expectNoSeriousAxeIssues(page);
});
