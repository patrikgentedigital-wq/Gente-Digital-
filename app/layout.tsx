import type { Metadata } from 'next';
import { Nunito_Sans, Rubik } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Rubik (cantos suaves, jeito de conversa) para títulos e números; Nunito Sans para leitura e dados.
const nunitoSans = Nunito_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-nunito' });
const rubik = Rubik({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-rubik' });

export const metadata: Metadata = {
  title: 'Gente Digital - Gestão de Links',
  description: 'Gestão de Links de Indicação para colaboradores.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Gente Digital',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${nunitoSans.variable} ${rubik.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-[var(--app-canvas)] text-[var(--app-ink)] selection:bg-brand-yellow selection:text-brand-charcoal" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
