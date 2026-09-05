import { NextResponse } from 'next/server'
import {
  withLocationContext,
  buildLocationOrderFilter,
  locationFailure,
} from '@server/partyLocationAccess'
import { parseLocationOrderQuery } from '@server/partyLocationScopeCore'
import {
  enrichLocationOrders,
  locationOrderProjection,
} from '@server/partyLocationWorkspace'
import { getPartyOrderModel } from '@server/partyModels'
import { buildPartyFinanceCsv } from '@helpers/partyFinanceCsv'

export const dynamic = 'force-dynamic'
export const GET = withLocationContext(async (req, context) => {
  const filter = buildLocationOrderFilter(
    context,
    parseLocationOrderQuery(new URL(req.url).searchParams)
  )
  const Orders = await getPartyOrderModel()
  const orders = await Orders.find(filter)
    .select(`${locationOrderProjection} tenantId`)
    .sort({ eventDate: 1 })
    .limit(5001)
    .lean()
  if (orders.length > 5000)
    locationFailure('Сузьте период выгрузки: максимум 5000 заказов')
  const enriched = await enrichLocationOrders(context, orders)
  // Prevent spreadsheet formula interpretation of free-form client/order comments.
  const cellText = (value) =>
    /^(?:[\t\r\n]|\s*[=+@-])/.test(value || '') ? `'${value}` : value
  const csvOrders = enriched.map((order) => ({
    ...order,
    title: cellText(order.title),
    serviceTitle: cellText(order.serviceTitle),
    client: { ...order.client, name: cellText(order.client.name) },
    transactions: order.transactions.map((item) => ({
      ...item,
      comment: cellText(item.comment),
    })),
  }))
  return new NextResponse(`\uFEFF${buildPartyFinanceCsv(csvOrders)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="location-finance.csv"',
      'Cache-Control': 'private, no-store',
    },
  })
})
