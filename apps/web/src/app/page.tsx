import Link from "next/link";
import { createTranslator } from "@santa-tracker/localization";
import CountdownTiles from "@/components/countdown-tiles";
import FestiveBackdrop from "@/components/festive-backdrop";
import { canViewFeature } from "@/lib/access";
import { isAdventEnabled } from "@/lib/config";
import { getRequestLocale } from "@/lib/request-locale";

// Which links appear depends on the clock and the admin session, so never prerender this page.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const translator = createTranslator({ locale: await getRequestLocale() });
  // A link only appears when its page is open to this visitor, so nobody lands on a 404.
  const trackerVisible = await canViewFeature("tracker");
  const adventVisible = isAdventEnabled() && (await canViewFeature("advent"));
  return (
    <>
      <FestiveBackdrop />
      <nav className="fixed top-6 left-1/2 z-40 flex -translate-x-1/2 gap-4 rounded-full bg-white/15 px-6 py-2 backdrop-blur-md">
        <Link href="/" className="font-semibold text-white" aria-current="page">{translator.t("nav.home")}</Link>
        {trackerVisible && <Link href="/tracker" className="text-white/80 hover:text-white">{translator.t("nav.tracker")}</Link>}
        {adventVisible && <Link href="/advent" className="text-white/80 hover:text-white">{translator.t("nav.village")}</Link>}
      </nav>
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="max-w-3xl">
          <h1 className="festive-title mb-4 text-5xl font-bold md:text-7xl">{translator.t("home.title")}</h1>
          <p className="mb-10 text-xl text-white/90">{translator.t("home.subtitle")}</p>
          <section aria-labelledby="countdown-heading" className="mb-10">
            <h2 id="countdown-heading" className="mb-4 font-semibold uppercase tracking-widest text-yellow-300">
              {translator.t("home.countdown")}
            </h2>
            <CountdownTiles locale={translator.locale} flyingText={translator.t("home.flyingTonight")} />
          </section>
          {trackerVisible && (
            <Link
              href="/tracker"
              className="inline-block rounded-full bg-red-600 px-10 py-3 text-lg font-bold text-white shadow-lg ring-2 ring-yellow-300/70 transition hover:-translate-y-0.5 hover:bg-red-500 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-yellow-300"
            >
              {translator.t("home.trackSanta")}
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
