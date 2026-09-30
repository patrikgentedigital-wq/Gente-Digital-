/**
 * Referrals created by the post-sale flow are scoped by their collection link,
 * never by `leads.ref` (which intentionally stores the origin customer).
 */
export function filterLegacyRefLeads<T extends { source?: unknown }>(leads: T[]): T[] {
  return leads.filter((lead) => lead.source !== 'post_sale');
}
