import { getPartyLocationModel, getPartyOrderModel } from '@server/partyModels'
import {
  withLocationContext,
  scopedJson,
  buildLocationOrderFilter,
  requireLocationObjectId,
} from '@server/partyLocationAccess'
import { parseLocationOrderQuery } from '@server/partyLocationScopeCore'
import {
  safeLocation,
  enrichLocationOrders,
  locationOrderProjection,
} from '@server/partyLocationWorkspace'

export const dynamic = 'force-dynamic'
export const GET = withLocationContext(async (req, context) => {
  const params = new URL(req.url).searchParams
  const scope = buildLocationOrderFilter(
    context,
    parseLocationOrderQuery(params)
  )
  const parsedLimit = Number(params.get('limit') || 30)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, Math.floor(parsedLimit)))
    : 30
  const cursor = params.get('cursor')
  const filter = cursor
    ? { $and: [scope, { _id: { $lt: requireLocationObjectId(cursor) } }] }
    : scope
  const [Locations, Orders] = await Promise.all([
    getPartyLocationModel(),
    getPartyOrderModel(),
  ])
  const [locations, orders, total] = await Promise.all([
    Locations.find({
      tenantId: context.tenantId,
      _id: { $in: context.staff.locationIds },
    })
      .select('_id title address status')
      .sort({ title: 1 })
      .lean(),
    Orders.find(filter)
      .select(`${locationOrderProjection} tenantId`)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean(),
    Orders.countDocuments(scope),
  ])
  const page = orders.slice(0, limit)
  return scopedJson({
    locations: locations.map(safeLocation),
    orders: await enrichLocationOrders(context, page),
    total,
    nextCursor: orders.length > limit ? String(page.at(-1)._id) : null,
  })
})
