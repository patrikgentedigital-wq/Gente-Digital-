'use client';

import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/components/providers/notification-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </ThemeProvider>
  );
}
