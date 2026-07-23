import type { Metadata } from 'next';
import { Inter, Montserrat, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

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
    <html lang="pt-BR" className={`${inter.variable} ${montserrat.variable} ${plusJakarta.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-brand-surface text-brand-charcoal dark:bg-[#09090b] dark:text-gray-100 selection:bg-brand-yellow selection:text-brand-charcoal" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
