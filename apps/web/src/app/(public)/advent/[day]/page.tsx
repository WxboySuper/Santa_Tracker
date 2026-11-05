import Link from "next/link";
import { createTranslator } from "@santa-tracker/localization";
import { notFound } from "next/navigation";
import { DayContent } from "@/components/advent/day-content";
import { getDayContent, parseDayNumber } from "@/lib/advent";
import { formatUnlockDate } from "@/lib/advent-ui";
import { isAdventEnabled } from "@/lib/config";
import { getRequestLocale } from "@/lib/request-locale";

// Unlock checks run per request against the trusted clock; never cache or prerender a day.
export const dynamic = "force-dynamic";

export default async function AdventDayPage({ params }: { params: Promise<{ day: string }> }) {
  if (!isAdventEnabled()) notFound();
  const dayNumber = parseDayNumber((await params).day);
  if (dayNumber === null) notFound();
  const day = await getDayContent(dayNumber);
  if (!day) notFound();

  const locale = await getRequestLocale();
  const translator = createTranslator({ locale });
  const date = formatUnlockDate(day.unlock_time, locale);

  return (
    <div className="flex min-h-screen flex-col items-center p-8 text-white">
      <Link href="/advent" className="mb-8 self-start underline">{translator.t("advent.backToCalendar")}</Link>
      <main className="w-full max-w-2xl rounded-xl bg-white/10 p-6 backdrop-blur-md">
        <h1 className="mb-4 text-3xl font-bold">{translator.t("advent.day", { day: day.day, title: day.title })}</h1>
        {day.is_unlocked ? (
          <DayContent day={day} fallback={<p>{translator.t("advent.comingSoon")}</p>} />
        ) : (
          <p>{translator.t("advent.lockedHint", { date })}</p>
        )}
      </main>
    </div>
  );
}
