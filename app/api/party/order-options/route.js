import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  partyError,
  isValidObjectId,
} from '@server/partyApi'
import {
  getPartyClientModel,
  getPartyStaffModel,
  getPartyServiceModel,
  getPartyLocationModel,
  getPartyOrderModel,
} from '@server/partyModels'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '@helpers/partyRolePermissions'

export const dynamic = 'force-dynamic'
export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  if (!canPartyAccess(context, { resource: 'orders' }))
    return partyError(403, 'partycrm_forbidden', 'Нет доступа к заказам')
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const requestedOrderId =
    req.nextUrl?.searchParams?.get('orderId') ||
    (req.url ? new URL(req.url).searchParams.get('orderId') : '')
  if (requestedOrderId && !isValidObjectId(requestedOrderId))
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный заказ')
  const [Clients, Staff, Services, Locations, Orders] = await Promise.all([
    getPartyClientModel(),
    getPartyStaffModel(),
    getPartyServiceModel(),
    getPartyLocationModel(),
    getPartyOrderModel(),
  ])
  const selectedOrder = requestedOrderId
    ? await Orders.findOne({
        _id: requestedOrderId,
        tenantId: context.tenantId,
      }).lean()
    : null
  if (
    requestedOrderId &&
    (!selectedOrder ||
      !canPartyAccess(context, { resource: 'orders', order: selectedOrder }))
  )
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  const canChooseClient = can('orders.clientId', 'edit')
  const canReadClients =
    can('orders.client.name') ||
    can('orders.client.phone') ||
    can('orders.client.email')
  const canReadManager = can('orders.responsibleStaffId')
  const canChooseStaff =
    can('orders.assignedStaff', 'edit') ||
    can('orders.responsibleStaffId', 'edit')
  const scopedOrders = selectedOrder
    ? [selectedOrder]
    : (canReadClients && !canChooseClient) ||
        can('orders.assignedStaff') ||
        can('finance.payouts') ||
        canReadManager
      ? await Orders.find(buildPartyOrderAccessFilter(context))
          .select(
            'clientId otherContacts.clientId assignedStaff.staffId responsibleStaffId'
          )
          .limit(120)
          .lean()
      : []
  const clientIds = scopedOrders
    .flatMap((order) => [
      order.clientId,
      ...(order.otherContacts || []).map((item) => item.clientId),
    ])
    .filter(Boolean)
  const teamIds = [
    ...new Set(
      scopedOrders.flatMap((order) =>
        (order.assignedStaff || []).map((assignment) =>
          String(assignment.staffId)
        )
      )
    ),
  ]
  const visibleStaffIds = [
    ...new Set([
      ...(can('orders.assignedStaff') || can('finance.payouts') ? teamIds : []),
      ...(canReadManager
        ? scopedOrders
            .map((order) => order.responsibleStaffId)
            .filter(Boolean)
            .map(String)
        : []),
    ]),
  ]
  const [clients, staff, services, locations] = await Promise.all([
    canReadClients
      ? Clients.find({
          tenantId: context.tenantId,
          status: { $ne: 'archived' },
          ...(!canChooseClient ? { _id: { $in: clientIds } } : {}),
        })
          .select(
            '_id firstName secondName thirdName phone email whatsapp telegram'
          )
          .sort({ firstName: 1 })
          .limit(500)
          .lean()
      : [],
    can('orders.assignedStaff') || can('finance.payouts') || canReadManager
      ? Staff.find({
          tenantId: context.tenantId,
          ...(selectedOrder
            ? { $or: [{ status: 'active' }, { _id: { $in: visibleStaffIds } }] }
            : { status: 'active' }),
          ...(!canChooseStaff ? { _id: { $in: visibleStaffIds } } : {}),
        })
          .select('_id firstName secondName role phone status')
          .limit(500)
          .lean()
      : [],
    can('orders.servicesIds') || can('orders.serviceTitle')
      ? Services.find({
          tenantId: context.tenantId,
          status: { $ne: 'archived' },
        })
          .select('_id title')
          .sort({ title: 1 })
          .limit(500)
          .lean()
      : [],
    can('orders.locationId')
      ? Locations.find({
          tenantId: context.tenantId,
          status: { $ne: 'archived' },
          ...(context.position?.orderScope?.locationIds?.length
            ? { _id: { $in: context.position.orderScope.locationIds } }
            : {}),
        })
          .select('_id title address')
          .sort({ title: 1 })
          .limit(500)
          .lean()
      : [],
  ])
  return NextResponse.json({
    success: true,
    data: {
      clients: clients.map((client) => ({
        _id: String(client._id),
        name: can('orders.client.name')
          ? [client.firstName, client.secondName, client.thirdName]
              .filter(Boolean)
              .join(' ')
          : 'Контакт',
        ...(can('orders.client.name')
          ? {
              nameParts: {
                firstName: client.firstName || '',
                secondName: client.secondName || '',
                thirdName: client.thirdName || '',
              },
            }
          : {}),
        ...(can('orders.client.phone')
          ? {
              phone: client.phone,
              whatsapp: client.whatsapp,
              telegram: client.telegram,
            }
          : {}),
        ...(can('orders.client.email') ? { email: client.email } : {}),
      })),
      staff: staff.map((person) => ({
        _id: String(person._id),
        name:
          [person.firstName, person.secondName].filter(Boolean).join(' ') ||
          'Сотрудник',
        role: person.role,
        ...(person.status ? { status: person.status } : {}),
        ...(can('staff.phone') &&
        (can('staff') || visibleStaffIds.includes(String(person._id)))
          ? { phone: person.phone }
          : {}),
      })),
      services,
      locations,
      context: {
        tenantId: context.tenantId,
        role: context.role,
        staff: context.staff,
        position: context.position,
        access: context.access,
        company: {
          _id: context.company._id,
          title: context.company.title,
          settings: { timeZone: context.company.settings?.timeZone },
        },
      },
    },
  })
}
