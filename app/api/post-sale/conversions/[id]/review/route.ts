import { postSaleHandlers } from '@/lib/post-sale/handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return postSaleHandlers.reviewConversion(request, id);
}
