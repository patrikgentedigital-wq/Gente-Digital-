'use client';

import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { ToastProvider } from '@/components/providers/toast-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ToastProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
