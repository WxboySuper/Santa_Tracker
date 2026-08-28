import Link from "next/link";
import { t } from "@santa-tracker/localization";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-4">{t("notFound.title")}</h1>
      <p className="opacity-80 mb-4">{t("notFound.message")}</p>
      <Link href="/" className="bg-white text-blue-900 px-6 py-2 rounded-full font-semibold">{t("notFound.home")}</Link>
    </div>
  );
}
