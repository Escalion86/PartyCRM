import { withLocationContext, scopedJson } from '@server/partyLocationAccess'
import {
  loadLocationOrder,
  enrichLocationOrders,
} from '@server/partyLocationWorkspace'

export const dynamic = 'force-dynamic'
export const GET = withLocationContext(async (_req, context, { params }) => {
  const order = await loadLocationOrder(context, (await params).id)
  return scopedJson((await enrichLocationOrders(context, [order]))[0])
})
