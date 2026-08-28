import type { Metadata } from 'next';
import { createTranslator } from '@santa-tracker/localization';
import { getRequestLocale } from '@/lib/request-locale';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const translator = createTranslator({ locale: await getRequestLocale() });
  return { title: translator.t('metadata.title'), description: translator.t('metadata.description') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {
  const translator = createTranslator({ locale: await getRequestLocale() });
  return (
    <html lang={translator.locale}>
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">{children}</body>
    </html>
  );
}
