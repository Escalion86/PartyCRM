import { NextResponse } from 'next/server'
import { syncPartyOrderInventory } from '@server/partyInventory'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyServiceModel,
  getPartyStaffModel,
  getPartyTransactionModel,
} from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  findPartyOrderConflicts,
  hasPartyOrderConflicts,
} from '@server/partyOrderConflicts'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import {
  canCreatePartyOrderByTariff,
  filterPartyOrderPayloadByTariffAccess,
} from '@helpers/partyTariffAccess'
import { sendPartyPerformerAssignmentPushes } from '@server/partyPerformerPush'
import {
  normalizePartyAdditionalEvents,
  normalizePartyOrderResponsibleStaffId,
  normalizePartyOrderTiming,
} from '@server/partyOrderPayload'
import { applyPartyAssignmentConfirmationDefaults } from '@helpers/partyOrderAssignments'
import { recordPartyOrderAudit } from '@server/partyAuditLog'
import { buildPartyOpenPreparationFilter } from '@helpers/partyOrderPreparation'

const parseDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

const normalizePaymentStatus = (value) =>
  ['none', 'wait_prepayment', 'prepaid', 'paid'].includes(value)
    ? value
    : 'none'

const parseOptionalDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const getMonthRange = (value) => {
  const date = value instanceof Date && !Number.isNaN(value.getTime())
    ? value
    : new Date()
  return {
    monthStart: new Date(date.getFullYear(), date.getMonth(), 1),
    nextMonthStart: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  }
}

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const normalizeAddress = (value) => ({
  town: typeof value?.town === 'string' ? value.town.trim() : '',
  street: typeof value?.street === 'string' ? value.street.trim() : '',
  house: typeof value?.house === 'string' ? value.house.trim() : '',
  room: typeof value?.room === 'string' ? value.room.trim() : '',
  comment: typeof value?.comment === 'string' ? value.comment.trim() : '',
})

const formatAddressLine = (address) =>
  [
    address.town,
    address.street,
    address.house ? `д. ${address.house}` : '',
    address.room,
  ]
    .filter(Boolean)
    .join(', ') + (address.comment ? ` (${address.comment})` : '')

const normalizeAssignedStaff = (items) => {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  return items
    .map((item) => {
      const staffId = String(item?.staffId || '').trim()
      if (!isValidObjectId(staffId) || seen.has(staffId)) return null
      seen.add(staffId)
      return {
        staffId,
        role: ['performer', 'admin', 'assistant'].includes(item.role)
          ? item.role
          : 'performer',
        payoutAmount: parseMoney(item.payoutAmount),
        payoutStatus: ['planned', 'ready', 'paid', 'canceled'].includes(
          item.payoutStatus
        )
          ? item.payoutStatus
          : 'planned',
        confirmationStatus: [
          'pending',
          'confirmed',
          'declined',
          'done',
        ].includes(item.confirmationStatus)
          ? item.confirmationStatus
          : 'pending',
      }
    })
    .filter(Boolean)
}

const normalizeServicesIds = (items) => {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  return items
    .map((item) => String(item || '').trim())
    .filter((id) => {
      if (!isValidObjectId(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
}

const PARTY_TRANSACTION_CATEGORIES = new Set([
  'deposit',
  'final_payment',
  'client_payment',
  'payout',
  'refund',
  'taxes',
  'materials',
  'travel',
  'other',
])

const normalizeTransactions = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => ({
      amount: parseMoney(item?.amount),
      type: item?.type === 'expense' ? 'expense' : 'income',
      category: PARTY_TRANSACTION_CATEGORIES.has(String(item?.category || ''))
        ? item.category
        : item?.type === 'expense'
          ? 'other'
          : 'deposit',
      staffId:
        item?.type === 'expense' &&
        item?.category === 'payout' &&
        isValidObjectId(item?.staffId)
          ? String(item.staffId)
          : null,
      date: parseOptionalDate(item?.date),
      comment:
        typeof item?.comment === 'string'
          ? item.comment.trim().slice(0, 1000)
          : '',
      paymentMethod: ['transfer', 'account', 'cash', 'barter'].includes(
        item?.paymentMethod
      )
        ? item.paymentMethod
        : 'transfer',
    }))
    .filter((item) => item.amount > 0)
}

const normalizeOtherContacts = (items) => {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  return items
    .map((item) => {
      const clientId = String(item?.clientId || '').trim()
      if (!isValidObjectId(clientId) || seen.has(clientId)) return null
      seen.add(clientId)
      return {
        clientId,
        comment:
          typeof item?.comment === 'string'
            ? item.comment.trim().slice(0, 180)
            : '',
      }
    })
    .filter(Boolean)
}

export const normalizeOrderPayload = (
  body,
  { fallbackResponsibleStaffId = null } = {}
) => {
  const placeType =
    body.placeType === 'client_address' ? 'client_address' : 'company_location'
  const locationId =
    placeType === 'company_location' && isValidObjectId(body.locationId)
      ? String(body.locationId)
      : null
  const clientId = isValidObjectId(body.clientId) ? String(body.clientId) : null

  const clientAddress = normalizeAddress(body.clientAddress)
  const customAddressFallback = formatAddressLine(clientAddress)
  const timing = normalizePartyOrderTiming({
    eventDate: body.eventDate,
    dateEnd: body.dateEnd,
    durationMinutes: body.durationMinutes,
  })

  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    status: ['draft', 'active', 'canceled', 'closed'].includes(body.status)
      ? body.status
      : 'draft',
    clientId,
    client: {
      name:
        typeof body.client?.name === 'string' ? body.client.name.trim() : '',
      phone: normalizePhone(body.client?.phone),
      email:
        typeof body.client?.email === 'string'
          ? body.client.email.trim().toLowerCase()
          : '',
    },
    eventDate: timing.eventDate,
    dateEnd: timing.dateEnd,
    durationMinutes: timing.durationMinutes,
    placeType,
    locationId,
    customAddress:
      typeof body.customAddress === 'string' && body.customAddress.trim()
        ? body.customAddress.trim()
        : customAddressFallback,
    clientAddress,
    servicesIds: normalizeServicesIds(body.servicesIds),
    serviceTitle:
      typeof body.serviceTitle === 'string' ? body.serviceTitle.trim() : '',
    contractAmount:
      body.contractAmount !== undefined
        ? parseMoney(body.contractAmount)
        : parseMoney(body.clientPayment?.totalAmount),
    transactions: normalizeTransactions(body.transactions),
    additionalEvents: normalizePartyAdditionalEvents(body.additionalEvents, {
      isValidObjectId,
    }),
    otherContacts: normalizeOtherContacts(body.otherContacts),
    // Keep legacy clientPayment synchronized for old UI/data readers.
    clientPayment: {
      totalAmount:
        body.contractAmount !== undefined
          ? parseMoney(body.contractAmount)
          : parseMoney(body.clientPayment?.totalAmount),
      prepaidAmount: parseMoney(body.clientPayment?.prepaidAmount),
      status: normalizePaymentStatus(body.clientPayment?.status),
    },
    assignedStaff: normalizeAssignedStaff(body.assignedStaff),
    responsibleStaffId: normalizePartyOrderResponsibleStaffId(
      body.responsibleStaffId,
      {
        fallbackStaffId: fallbackResponsibleStaffId,
        isValidObjectId,
      }
    ),
    adminComment:
      typeof body.adminComment === 'string' ? body.adminComment.trim() : '',
    performerComment:
      typeof body.performerComment === 'string'
        ? body.performerComment.trim()
        : '',
  }
}

export const validateOrderReferences = async ({ tenantId, payload }) => {
  const clientIds = [
    payload.clientId,
    ...(payload.otherContacts ?? []).map((item) => item.clientId),
  ].filter(Boolean)

  if (clientIds.length > 0) {
    const PartyClients = await getPartyClientModel()
    const uniqueClientIds = [...new Set(clientIds)]
    const count = await PartyClients.countDocuments({
      _id: { $in: uniqueClientIds },
      tenantId,
      status: { $ne: 'archived' },
    })
    if (count !== uniqueClientIds.length) {
      return partyError(
        400,
        'partycrm_client_not_found',
        'Один или несколько выбранных клиентов не найдены',
        'validation'
      )
    }
  }

  if (payload.locationId) {
    const PartyLocations = await getPartyLocationModel()
    const exists = await PartyLocations.exists({
      _id: payload.locationId,
      tenantId,
      status: { $ne: 'archived' },
    })
    if (!exists) {
      return partyError(
        400,
        'partycrm_location_not_found',
        'Выбранная точка не найдена',
        'validation'
      )
    }
  }

  if (payload.assignedStaff.length > 0) {
    const ids = payload.assignedStaff.map((item) => item.staffId)
    const PartyStaff = await getPartyStaffModel()
    const count = await PartyStaff.countDocuments({
      _id: { $in: ids },
      tenantId,
      status: { $ne: 'archived' },
    })
    if (count !== ids.length) {
      return partyError(
        400,
        'partycrm_staff_not_found',
        'Один или несколько исполнителей не найдены',
        'validation'
      )
    }
  }

  const responsibleStaffIds = [
    payload.responsibleStaffId,
    ...(payload.additionalEvents ?? []).map((item) => item.responsibleStaffId),
  ].filter(Boolean)

  if (responsibleStaffIds.length > 0) {
    const uniqueIds = [...new Set(responsibleStaffIds.map(String))]
    const PartyStaff = await getPartyStaffModel()
    const count = await PartyStaff.countDocuments({
      _id: { $in: uniqueIds },
      tenantId,
      role: { $in: ['owner', 'admin'] },
      status: { $ne: 'archived' },
    })
    if (count !== uniqueIds.length) {
      return partyError(
        400,
        'partycrm_responsible_staff_not_found',
        'Выбранный ответственный администратор не найден',
        'validation'
      )
    }
  }

  if (payload.servicesIds.length > 0) {
    const PartyServices = await getPartyServiceModel()
    const count = await PartyServices.countDocuments({
      _id: { $in: payload.servicesIds },
      tenantId,
      status: { $ne: 'archived' },
    })
    if (count !== payload.servicesIds.length) {
      return partyError(
        400,
        'partycrm_service_not_found',
        'Одна или несколько услуг не найдены',
        'validation'
      )
    }
  }

  return null
}

const buildOrderClientSnapshot = async ({ tenantId, payload }) => {
  if (!payload.clientId) return payload

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.findOne({
    _id: payload.clientId,
    tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!client) return payload

  return {
    ...payload,
    client: {
      name: [client.firstName, client.secondName, client.thirdName]
        .filter(Boolean)
        .join(' '),
      phone: client.phone || '',
      email: client.email || '',
    },
  }
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const preparationFilter = new URL(req.url).searchParams.get('preparation')
  if (preparationFilter && preparationFilter !== 'open') return partyError(400, 'partycrm_invalid_preparation_filter', 'Некорректный фильтр подготовки', 'validation')
  const PartyOrders = await getPartyOrderModel()
  const orders = await PartyOrders.find({
    tenantId: context.tenantId,
    status: { $ne: 'canceled' },
    ...(preparationFilter === 'open' ? buildPartyOpenPreparationFilter() : {}),
  })
    .sort({ eventDate: 1, createdAt: -1 })
    .limit(120)
    .lean()
  const assignmentStaffIds = [
    ...new Set(
      orders.flatMap((order) =>
        (Array.isArray(order.assignedStaff) ? order.assignedStaff : [])
          .map((item) => String(item?.staffId || ''))
          .filter(Boolean)
      )
    ),
  ]
  const PartyStaff = await getPartyStaffModel()
  const orderIds = orders.map((order) => String(order._id))
  const PartyTransactions = await getPartyTransactionModel()
  const [assignmentStaff, transactions] = await Promise.all([
    assignmentStaffIds.length
      ? PartyStaff.find({
          _id: { $in: assignmentStaffIds },
          tenantId: context.tenantId,
          status: { $ne: 'archived' },
        })
          .select('_id authUserId linkedAuthUserId')
          .lean()
      : Promise.resolve([]),
    orderIds.length
      ? PartyTransactions.find({
          tenantId: context.tenantId,
          orderId: { $in: orderIds },
        })
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : Promise.resolve([]),
  ])
  const ordersWithAssignmentDefaults = orders.map((order) => ({
    ...order,
    assignedStaff: applyPartyAssignmentConfirmationDefaults({
      assignedStaff: order.assignedStaff,
      staff: assignmentStaff,
    }),
  }))
  const transactionsByOrderId = transactions.reduce((map, transaction) => {
    const orderId = String(transaction.orderId)
    if (!map.has(orderId)) map.set(orderId, [])
    map.get(orderId).push({
      _id: String(transaction._id),
      amount: Number(transaction.amount || 0),
      type: transaction.type,
      category: transaction.category,
      date: transaction.date ? new Date(transaction.date).toISOString() : null,
      comment: transaction.comment || '',
      paymentMethod: transaction.paymentMethod || 'transfer',
    })
    return map
  }, new Map())
  const ordersWithTransactions = ordersWithAssignmentDefaults.map((order) => {
    const orderTransactions = transactionsByOrderId.get(String(order._id))
    return {
      ...order,
      transactions:
        orderTransactions && orderTransactions.length > 0
          ? orderTransactions
          : order.transactions,
    }
  })

  return NextResponse.json({ success: true, data: ordersWithTransactions })
}

export const applyPartyAssignmentAccountDefaults = async ({
  tenantId,
  payload,
}) => {
  if (!Array.isArray(payload?.assignedStaff) || payload.assignedStaff.length === 0) {
    return payload
  }

  const PartyStaff = await getPartyStaffModel()
  const staff = await PartyStaff.find({
    _id: { $in: payload.assignedStaff.map((item) => item.staffId) },
    tenantId,
    status: { $ne: 'archived' },
  })
    .select('_id authUserId linkedAuthUserId')
    .lean()

  return {
    ...payload,
    assignedStaff: applyPartyAssignmentConfirmationDefaults({
      assignedStaff: payload.assignedStaff,
      staff,
    }),
  }
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizeOrderPayload(body, {
    fallbackResponsibleStaffId: context.staff?._id,
  })

  if (
    !payload.clientId &&
    !payload.client.name &&
    payload.servicesIds.length === 0 &&
    !payload.serviceTitle
  ) {
    return partyError(
      400,
      'partycrm_order_client_or_service_required',
      'Укажите клиента или услугу заказа',
      'validation'
    )
  }

  const referenceError = await validateOrderReferences({
    tenantId: context.tenantId,
    payload,
  })
  if (referenceError) return referenceError
  const payloadWithAssignmentDefaults = await applyPartyAssignmentAccountDefaults({
    tenantId: context.tenantId,
    payload,
  })
  const payloadWithClient = await buildOrderClientSnapshot({
    tenantId: context.tenantId,
    payload: payloadWithAssignmentDefaults,
  })

  const PartyOrders = await getPartyOrderModel()
  const { monthStart, nextMonthStart } = getMonthRange(payload.eventDate)
  const currentMonthOrdersCount = await PartyOrders.countDocuments({
    tenantId: context.tenantId,
    status: { $ne: 'canceled' },
    eventDate: { $gte: monthStart, $lt: nextMonthStart },
  })
  const { access } = await getPartyCompanyTariffAccessState(context.company)
  const limitState = canCreatePartyOrderByTariff({
    access,
    currentMonthOrdersCount,
  })
  if (!limitState.ok) {
    return partyError(
      403,
      limitState.code,
      limitState.message,
      'permission'
    )
  }

  const limitedPayload = filterPartyOrderPayloadByTariffAccess(
    payloadWithClient,
    access
  )

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: context.tenantId,
    payload: limitedPayload,
  })
  if (hasPartyOrderConflicts(conflicts)) {
    return partyError(
      409,
      'partycrm_order_conflict',
      'Найдены пересечения по точке или исполнителю',
      'validation',
      { conflicts }
    )
  }

  const order = await PartyOrders.create({
    ...limitedPayload,
    tenantId: context.tenantId,
  })

  await recordPartyOrderAudit({
    context,
    order,
    action: 'order_created',
    summary: 'Создал заказ',
    changes: [],
  })

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(order._id),
  })

  await sendPartyPerformerAssignmentPushes({
    tenantId: context.tenantId,
    company: context.company,
    nextOrder: order,
    source: 'party-order-created',
  })

  const inventory = await syncPartyOrderInventory({ tenantId: context.tenantId, order, staffId: context.staff?._id })
  return NextResponse.json({ success: true, data: order, inventory }, { status: 201 })
}
