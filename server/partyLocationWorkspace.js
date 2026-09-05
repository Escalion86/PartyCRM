import {
  getPartyOrderModel,
  getPartyLocationModel,
  getPartyClientModel,
  getPartyStaffModel,
  getPartyServiceModel,
  getPartyTransactionModel,
} from './partyModels'
import { getPartyOrderCloseReadiness } from '@helpers/partyOrderCloseReadiness'
import {
  PARTY_ORDER_TRANSACTION_CATEGORIES,
  PARTY_ORDER_PAYMENT_METHODS,
} from '@helpers/partyOrderTransactions'
import { serializePartyTransaction } from './partyTransactionsCore'
import {
  buildLocationOrderFilter,
  locationFailure,
  requireLocationObjectId,
} from './partyLocationAccess'
import { serializePartyOrderPreparation } from '@helpers/partyOrderPreparation'

const string = (value) => (typeof value === 'string' ? value : '')
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const iso = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : null
export const locationOrderProjection =
  '_id title status clientId client eventDate dateEnd durationMinutes locationId servicesIds serviceTitle contractAmount clientPayment transactions additionalEvents assignedStaff.staffId assignedStaff.role assignedStaff.payoutAmount assignedStaff.payoutStatus preparation'
export const safeLocation = (location) => ({
  _id: String(location._id),
  title: string(location.title),
  status: string(location.status),
  address: Object.fromEntries(
    ['town', 'street', 'house', 'room', 'comment'].map((key) => [
      key,
      string(location.address?.[key]),
    ])
  ),
})
export const safeLocationOrder = ({
  order,
  locations = [],
  staff = [],
  clients = [],
  services = [],
  transactions = [],
}) => {
  const client = clients.find(
    (item) => String(item._id) === String(order.clientId)
  )
  const location = locations.find(
    (item) => String(item._id) === String(order.locationId)
  )
  const actualTransactions = transactions.length
    ? transactions
    : order.transactions || []
  const assignedIds = new Set(
    (order.assignedStaff || []).map((item) => String(item.staffId))
  )
  const safeTransactions = actualTransactions.map((item) =>
    serializePartyTransaction({
      _id: item._id,
      tenantId: order.tenantId,
      orderId: order._id,
      clientId: order.clientId,
      staffId: assignedIds.has(String(item.staffId)) ? item.staffId : null,
      amount: money(item.amount),
      type: item.type === 'expense' ? 'expense' : 'income',
      category: PARTY_ORDER_TRANSACTION_CATEGORIES.includes(item.category)
        ? item.category
        : 'other',
      date: iso(item.date),
      comment: string(item.comment),
      paymentMethod: PARTY_ORDER_PAYMENT_METHODS.includes(item.paymentMethod)
        ? item.paymentMethod
        : 'transfer',
      createdAt: iso(item.createdAt),
      updatedAt: iso(item.updatedAt),
    })
  )
  return {
    _id: String(order._id),
    title: string(order.title),
    status: string(order.status),
    eventDate: iso(order.eventDate),
    eventEndDate: iso(order.dateEnd),
    durationMinutes: money(order.durationMinutes),
    locationId: String(order.locationId),
    locationTitle: string(location?.title),
    client: {
      name:
        string(order.client?.name) ||
        [client?.firstName, client?.secondName].filter(Boolean).join(' '),
      phone: string(order.client?.phone) || string(client?.phone),
    },
    services: (order.servicesIds || [])
      .map((serviceId) => ({
        title: string(
          services.find((item) => String(item._id) === String(serviceId))?.title
        ),
      }))
      .filter((item) => item.title),
    serviceTitle: string(order.serviceTitle),
    contractAmount: money(
      order.contractAmount ?? order.clientPayment?.totalAmount
    ),
    assignedStaff: (order.assignedStaff || []).map((assignment) => {
      const person = staff.find(
        (item) => String(item._id) === String(assignment.staffId)
      )
      return {
        staffId: String(assignment.staffId),
        name:
          [person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
          'Исполнитель',
        role: string(assignment.role),
        payoutAmount: money(assignment.payoutAmount),
        payoutStatus: string(assignment.payoutStatus),
      }
    }),
    transactions: safeTransactions,
    readiness: getPartyOrderCloseReadiness({
      order,
      transactions: actualTransactions,
    }),
    preparation: serializePartyOrderPreparation(order, { includeNotes: false }),
  }
}

export const enrichLocationOrders = async (context, orders) => {
  if (!orders.length) return []
  const [Locations, Staff, Clients, Services, Transactions] = await Promise.all(
    [
      getPartyLocationModel(),
      getPartyStaffModel(),
      getPartyClientModel(),
      getPartyServiceModel(),
      getPartyTransactionModel(),
    ]
  )
  const [locations, staff, clients, services, transactions] = await Promise.all(
    [
      Locations.find({
        tenantId: context.tenantId,
        _id: { $in: orders.map((order) => order.locationId) },
      })
        .select('_id title')
        .lean(),
      Staff.find({
        tenantId: context.tenantId,
        _id: {
          $in: orders.flatMap((order) =>
            (order.assignedStaff || []).map((item) => item.staffId)
          ),
        },
      })
        .select('_id firstName secondName')
        .lean(),
      Clients.find({
        tenantId: context.tenantId,
        _id: { $in: orders.map((order) => order.clientId).filter(Boolean) },
      })
        .select('_id firstName secondName phone')
        .lean(),
      Services.find({
        tenantId: context.tenantId,
        _id: { $in: orders.flatMap((order) => order.servicesIds || []) },
      })
        .select('_id title')
        .lean(),
      Transactions.find({
        tenantId: context.tenantId,
        orderId: { $in: orders.map((order) => order._id) },
      })
        .sort({ date: -1, _id: -1 })
        .lean(),
    ]
  )
  return orders.map((order) =>
    safeLocationOrder({
      order,
      locations,
      staff,
      clients,
      services,
      transactions: transactions.filter(
        (item) => String(item.orderId) === String(order._id)
      ),
    })
  )
}
export const loadLocationOrder = async (context, orderId) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne(
    buildLocationOrderFilter(context, { _id: requireLocationObjectId(orderId) })
  )
    .select(`${locationOrderProjection} tenantId`)
    .lean()
  if (!order) locationFailure('Заказ не найден', 404)
  return order
}
