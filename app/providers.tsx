'use client';

import { useEffect } from 'react';
import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { ToastProvider } from '@/components/providers/toast-context';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => console.log('Service Worker registered with scope:', registration.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }
  }, []);

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
