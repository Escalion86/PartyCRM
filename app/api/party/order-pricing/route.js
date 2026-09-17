import { listPartyOrderPricing, partyOrderPricingRoute } from '@server/partyOrderPricing'

export const GET = partyOrderPricingRoute((req, context) => listPartyOrderPricing({
  tenantId: context.tenantId,
  cursor: req.nextUrl.searchParams.get('cursor') || '',
}))
