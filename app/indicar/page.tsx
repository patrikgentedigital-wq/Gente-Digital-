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
    <div className="flex min-h-screen items-center justify-center bg-[#39D3CF]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#075956] border-t-transparent" />
    </div>
  );
}
