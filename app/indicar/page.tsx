import type { Metadata } from 'next';
import { ReferralLanding } from './referral-landing';
import { normalizeReferralCode, normalizeTrackingCode } from '@/lib/referrals';

export const metadata: Metadata = {
  title: 'Indique e Ganhe | Gente Digital',
  description: 'Indique a Gente Digital, acompanhe sua indicação e receba a recompensa prevista no programa.',
  alternates: {
    canonical: '/indicar',
  },
};

type IndicarPageProps = {
  searchParams: Promise<{
    ref?: string | string[];
    status?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function IndicarPage({ searchParams }: IndicarPageProps) {
  const params = await searchParams;
  const refCode = normalizeReferralCode(firstValue(params.ref));
  const statusCode = normalizeTrackingCode(firstValue(params.status));

  return <ReferralLanding refCode={refCode} initialStatusCode={statusCode} />;
}
