import { postSaleHandlers } from '@/lib/post-sale/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return postSaleHandlers.reconcile(request);
}
