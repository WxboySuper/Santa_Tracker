import { isAdventEnabled } from "@/lib/config";
import { getManifest } from "@/lib/advent";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function AdventPage() {
  if (!isAdventEnabled()) notFound();
  const manifest = await getManifest();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-white">
      <nav className="mb-8 flex gap-4">
        <Link href="/" className="hover:underline">Home</Link>
        <Link href="/tracker" className="hover:underline">Tracker</Link>
        <Link href="/advent" className="font-bold">Village</Link>
      </nav>
      <h1 className="text-4xl font-bold mb-4">Advent Village</h1>
      <p className="opacity-80 mb-6">Daily unlocks December 1–24.</p>
      <section className="bg-white/10 backdrop-blur-md rounded-xl p-6 max-w-2xl w-full" aria-live="polite">
        <p className="mb-2">Total days: {manifest.total_days}</p>
        {manifest.days.map(day => (
          <div key={day.day} className="py-2 border-b border-white/20">
            <strong>Day {day.day}: {day.title}</strong> — {day.is_unlocked ? "Unlocked" : "Locked"}{" "}
            <small>{day.unlock_time}</small>
          </div>
        ))}
      </section>
    </div>
  );
}
