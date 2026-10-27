import { listPartyOrderPricing, partyOrderPricingRoute } from '@server/partyOrderPricing'

export const GET = partyOrderPricingRoute((req, context) => listPartyOrderPricing({
  tenantId: context.tenantId,
  context,
  cursor: req.nextUrl.searchParams.get('cursor') || '',
}))
