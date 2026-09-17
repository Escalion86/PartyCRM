import { parseJsonBody } from '@server/partyApi'
import { getPartyOrderPricing, partyOrderPricingRoute, updatePartyOrderPricing } from '@server/partyOrderPricing'

export const GET = partyOrderPricingRoute(async (_req, context, { params }) => getPartyOrderPricing({ tenantId: context.tenantId, orderId: (await params).id }))
export const PATCH = partyOrderPricingRoute(async (req, context, { params }) => updatePartyOrderPricing({ context, orderId: (await params).id, body: await parseJsonBody(req) }))
