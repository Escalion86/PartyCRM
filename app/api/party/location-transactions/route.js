import { withLocationContext, scopedJson } from '@server/partyLocationAccess'
import {
  loadLocationOrder,
  enrichLocationOrders,
} from '@server/partyLocationWorkspace'
import { createLocationTransaction } from '@server/partyLocationTransactions'

export const dynamic = 'force-dynamic'
export const GET = withLocationContext(async (req, context) => {
  const order = await loadLocationOrder(
    context,
    new URL(req.url).searchParams.get('orderId')
  )
  return scopedJson(
    (await enrichLocationOrders(context, [order]))[0].transactions
  )
})
export const POST = withLocationContext(async (req, context) =>
  scopedJson(
    await createLocationTransaction({
      context,
      body: await req.json(),
      key: req.headers.get('Idempotency-Key'),
    })
  )
)
