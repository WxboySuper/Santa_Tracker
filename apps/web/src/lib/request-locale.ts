import { headers } from "next/headers";
import { negotiateLocale } from "@santa-tracker/localization";

export async function getRequestLocale() {
  return negotiateLocale((await headers()).get("accept-language"));
}
