import Link from "next/link";
import { t } from "@santa-tracker/localization";
import { notFound } from "next/navigation";
import { getManifest } from "@/lib/advent";
import { isAdventEnabled } from "@/lib/config";

export default async function AdventPage() {
  if (!isAdventEnabled()) notFound();
  const manifest = await getManifest();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-white">
      <nav className="mb-8 flex gap-4">
        <Link href="/" className="hover:underline">{t("nav.home")}</Link>
        <Link href="/tracker" className="hover:underline">{t("nav.tracker")}</Link>
        <Link href="/advent" className="font-bold">{t("nav.village")}</Link>
      </nav>
      <h1 className="text-4xl font-bold mb-4">{t("advent.title")}</h1>
      <p className="opacity-80 mb-6">{t("advent.subtitle")}</p>
      <section className="bg-white/10 backdrop-blur-md rounded-xl p-6 max-w-2xl w-full" aria-live="polite">
        <p className="mb-2">{t("advent.totalDays", { count: manifest.total_days })}</p>
        {manifest.days.map(day => (
          <div key={day.day} className="py-2 border-b border-white/20">
            <strong>{t("advent.day", { day: day.day, title: day.title })}</strong> {day.is_unlocked ? t("advent.unlocked") : t("advent.locked")} {day.unlock_time}
          </div>
        ))}
      </section>
    </div>
  );
}
