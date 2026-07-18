import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });

export const metadata: Metadata = {
  title: 'Gente Digital - Gestão de Links',
  description: 'Gestão de Links de Indicação para colaboradores.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${montserrat.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-brand-surface text-brand-charcoal dark:bg-gray-900 dark:text-gray-100" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
