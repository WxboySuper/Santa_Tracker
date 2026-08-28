import type { Metadata } from 'next';
import { t } from '@santa-tracker/localization';
import './globals.css';

export const metadata: Metadata = {
  title: t('metadata.title'),
  description: t('metadata.description'),
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">{children}</body>
    </html>
  );
}
