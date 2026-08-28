import Link from "next/link";
import { t } from "@santa-tracker/localization";
import Countdown from "@/components/countdown";
import { isAdventEnabled } from "@/lib/config";

export default function HomePage() {
  const adventEnabled = isAdventEnabled();
  return (
    <>
      <nav className="glass-nav fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-white/20 backdrop-blur-md rounded-full px-6 py-2 flex gap-4">
        <Link href="/" className="nav-link nav-link-active text-white font-semibold">{t("nav.home")}</Link>
        <Link href="/tracker" className="nav-link text-white/80 hover:text-white">{t("nav.tracker")}</Link>
        {adventEnabled && <Link href="/advent" className="nav-link text-white/80 hover:text-white">{t("nav.village")}</Link>}
      </nav>
      <div className="hero min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="hero-content max-w-2xl">
          <h1 className="hero-title text-5xl md:text-7xl font-bold mb-4">
            {t("home.title")}
          </h1>
          <p className="hero-subtitle text-xl text-white/90 mb-8">{t("home.subtitle")}</p>
          <div className="countdown-box bg-white/10 backdrop-blur-md rounded-2xl border border-yellow-400/50 p-6 mb-8">
            <p className="countdown-label text-yellow-300 font-semibold mb-2">{t("home.countdown")}</p>
            <Countdown className="countdown-display text-3xl font-mono text-white" />
          </div>
          <div className="cta-buttons-container flex gap-4 justify-center">
            <Link href="/tracker" className="cta-button bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition">
              {t("home.trackSanta")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
