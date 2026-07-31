import { Suspense } from 'react';
import { ReferralLanding } from './referral-landing';

export default function IndicarPage() {
  return (
    <Suspense fallback={<LandingLoading />}>
      <ReferralLanding />
    </Suspense>
  );
}

function LandingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface dark:bg-gray-900">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-yellow border-t-transparent" />
    </div>
  );
}
