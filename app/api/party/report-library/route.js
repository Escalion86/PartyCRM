import { getPartyReportModel } from '@server/partyReportModels'
import { getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import {
  reportId,
  reportJson,
  withReportContext,
} from '@server/partyReportAccess'
import { serializeReportLibraryItems } from '@server/partyReportCore'

export const dynamic = 'force-dynamic'

export const GET = withReportContext(async (req, context) => {
  const query = new URL(req.url).searchParams
  const requested = Number(query.get('limit') || 15)
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(30, Math.floor(requested)))
    : 15
  const filter = {
    tenantId: context.tenantId,
    'templateSnapshot.fields': {
      $elemMatch: { section: 'creative', shareCreative: true },
    },
    'answers.status': 'accepted',
  }
  if (query.get('cursor')) filter._id = { $lt: reportId(query.get('cursor')) }
  const Reports = await getPartyReportModel()
  const candidates = await Reports.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = candidates.slice(0, limit)
  const [Orders, Staff] = await Promise.all([
    getPartyOrderModel(),
    getPartyStaffModel(),
  ])
  const [orders, people] = await Promise.all([
    Orders.find({
      tenantId: context.tenantId,
      _id: { $in: page.map((report) => report.orderId) },
    })
      .select('title serviceTitle eventDate')
      .lean(),
    Staff.find({
      tenantId: context.tenantId,
      _id: { $in: page.map((report) => report.staffId) },
    })
      .select('firstName secondName')
      .lean(),
  ])
  const orderMap = new Map(orders.map((order) => [String(order._id), order]))
  const peopleMap = new Map(
    people.map((person) => [
      String(person._id),
      [person.firstName, person.secondName].filter(Boolean).join(' '),
    ])
  )
  const items = page.flatMap((report) => {
    const order = orderMap.get(String(report.orderId))
    if (!order) return []
    return serializeReportLibraryItems(report, {
      orderTitle: order.title || order.serviceTitle || 'Мероприятие',
      eventDate: order.eventDate || null,
      staffName: peopleMap.get(String(report.staffId)) || 'Исполнитель',
    })
  })
  return reportJson({
    items,
    nextCursor: candidates.length > limit ? String(page.at(-1)._id) : null,
  })
})
