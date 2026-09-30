'use client';

import { useEffect } from 'react';
import { ThemeProvider } from 'next-themes';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { ToastProvider } from '@/components/providers/toast-context';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((name) => name.startsWith('gd-static-assets'))
              .map((name) => caches.delete(name))
          );
        }
      }).catch(() => undefined);
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => console.log('Service Worker registered with scope:', registration.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ToastProvider>
        <NotificationProvider>
          {children}
        </NotificationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
