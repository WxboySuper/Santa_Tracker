import type { Metadata } from 'next';
import { createTranslator } from '@santa-tracker/localization';
import './globals.css';

const translator = createTranslator();

export const metadata: Metadata = {
  title: translator.t('metadata.title'),
  description: translator.t('metadata.description'),
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang={translator.locale}>
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">{children}</body>
    </html>
  );
}
