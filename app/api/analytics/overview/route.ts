import { NextRequest } from 'next/server';
import { createAnalyticsOverviewHandler } from '@/lib/analytics/overview-handler';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest): Promise<Response> =>
  createAnalyticsOverviewHandler()(request);
