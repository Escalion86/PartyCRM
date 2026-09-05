import {
  withLocationContext,
  scopedJson,
  locationFailure,
} from '@server/partyLocationAccess'
import { closeLocationOrder } from '@server/partyLocationTransactions'
import {
  loadLocationOrder,
  enrichLocationOrders,
} from '@server/partyLocationWorkspace'

export const PATCH = withLocationContext(async (req, context, { params }) => {
  const body = await req.json()
  if (!body || Array.isArray(body) || Object.keys(body).length)
    locationFailure('Закрытие не принимает изменения полей заказа')
  const orderId = (await params).id
  await closeLocationOrder({ context, orderId })
  return scopedJson(
    (
      await enrichLocationOrders(context, [
        await loadLocationOrder(context, orderId),
      ])
    )[0]
  )
})
