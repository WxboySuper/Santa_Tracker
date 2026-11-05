import Link from "next/link";
import { createTranslator } from "@santa-tracker/localization";
import { notFound } from "next/navigation";
import { getManifest } from "@/lib/advent";
import { formatUnlockDate } from "@/lib/advent-ui";
import { isAdventEnabled } from "@/lib/config";
import { getRequestLocale } from "@/lib/request-locale";

// Unlock state depends on the current time, so this page must never be prerendered.
export const dynamic = "force-dynamic";

const doorBase =
  "flex aspect-square min-h-14 flex-col items-center justify-center rounded-xl border-2 text-center " +
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-yellow-300";
const doorOpen = `${doorBase} border-yellow-400 bg-red-700 text-white hover:bg-red-600`;
const doorLocked = `${doorBase} border-white/20 bg-white/5 text-white/60`;

export default async function AdventPage() {
  if (!isAdventEnabled()) notFound();
  const locale = await getRequestLocale();
  const translator = createTranslator({ locale });
  const manifest = await getManifest();
  return (
    <div className="flex min-h-screen flex-col items-center p-8 text-white">
      <nav className="mb-8 flex gap-4">
        <Link href="/" className="hover:underline">{translator.t("nav.home")}</Link>
        <Link href="/tracker" className="hover:underline">{translator.t("nav.tracker")}</Link>
        <Link href="/advent" className="font-bold" aria-current="page">{translator.t("nav.village")}</Link>
      </nav>
      <h1 className="mb-2 text-4xl font-bold">{translator.t("advent.title")}</h1>
      <p className="mb-8 opacity-80">{translator.t("advent.subtitle")}</p>
      <ol
        aria-label={translator.t("advent.calendarLabel")}
        className="grid w-full max-w-3xl list-none grid-cols-4 gap-3 p-0 sm:grid-cols-6"
      >
        {manifest.days.map((day) => {
          const date = formatUnlockDate(day.unlock_time, locale);
          return (
            <li key={day.day}>
              {day.is_unlocked ? (
                <Link
                  href={`/advent/${day.day}`}
                  className={doorOpen}
                  aria-label={translator.t("advent.openDay", { day: day.day, title: day.title })}
                >
                  <span className="text-2xl font-bold">{day.day}</span>
                </Link>
              ) : (
                <div className={doorLocked} role="img" aria-label={translator.t("advent.lockedDay", { day: day.day, date })}>
                  <span className="text-2xl font-bold">{day.day}</span>
                  <span className="text-xs">{date}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
