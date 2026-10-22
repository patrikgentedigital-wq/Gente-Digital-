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
    <div className="flex min-h-screen items-center justify-center bg-[#ffe300]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0e1b2c] border-t-transparent" />
    </div>
  );
}
