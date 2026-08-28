import Link from "next/link";
import { t } from "@santa-tracker/localization";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 text-white p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">{t("offline.title")}</h1>
      <p className="opacity-80 mb-4">{t("offline.message")}</p>
      <Link href="/" className="bg-white text-blue-900 px-6 py-2 rounded-full font-semibold">{t("offline.home")}</Link>
    </div>
  );
}
