import { notFound } from "next/navigation";
import { getRequestLocale } from "@/lib/request-locale";
import RouteDemo from "./route-demo";

export const dynamic = "force-dynamic";

/** Development only: fly the draft route in the real tracker on a simulated clock. */
export default async function RouteDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RouteDemo locale={await getRequestLocale()} />;
}
