import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './workspace-shell.css';
import { Providers } from './providers';

const inter = localFont({ src: './fonts/inter-latin.woff2', weight: '400 700', display: 'swap', variable: '--font-inter' });
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
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-[var(--app-canvas)] text-[var(--app-ink)] selection:bg-brand-yellow selection:text-brand-charcoal" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
