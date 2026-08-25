import { loginAdmin } from "@/lib/admin-login";
import { readJsonBody, respondWith } from "@/lib/admin-api";

export async function POST(req: Request) {
  const result = await loginAdmin(await readJsonBody(req));
  return respondWith(result);
}
