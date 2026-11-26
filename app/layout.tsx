import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './workspace-shell.css';
import { Providers } from './providers';

const dmSans = localFont({ src: './fonts/dm-sans-latin.woff2', weight: '100 900', display: 'swap', variable: '--font-dm-sans' });
export const viewport: Viewport = { themeColor: '#39D3CF' };

export const metadata: Metadata = {
  title: 'Gente Digital - Gestão de Links',
  description: 'Gestão de Links de Indicação para colaboradores.',
  icons: { icon: '/icon-192x192.png', apple: '/icon-192x192.png' },
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
    <html lang="pt-BR" className={dmSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-[var(--app-canvas)] text-[var(--app-ink)] selection:bg-brand-yellow selection:text-brand-charcoal" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
