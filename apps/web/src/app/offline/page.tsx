import Link from "next/link";
import { createTranslator } from "@santa-tracker/localization";
import { getRequestLocale } from "@/lib/request-locale";

export default async function OfflinePage() {
  const translator = createTranslator({ locale: await getRequestLocale() });
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 text-white p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">{translator.t("offline.title")}</h1>
      <p className="opacity-80 mb-4">{translator.t("offline.message")}</p>
      <Link href="/" className="bg-white text-blue-900 px-6 py-2 rounded-full font-semibold">{translator.t("offline.home")}</Link>
    </div>
  );
}
