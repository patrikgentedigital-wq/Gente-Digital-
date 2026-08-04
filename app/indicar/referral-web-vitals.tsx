'use client';

import { useReportWebVitals } from 'next/web-vitals';

export function ReferralWebVitals() {
  useReportWebVitals((metric) => {
    void fetch('/api/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: metric.id,
        name: metric.name,
        value: metric.value,
        delta: metric.delta,
        rating: metric.rating,
        navigationType: metric.navigationType,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  });

  return null;
}
