import { NextResponse } from 'next/server'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyProposalModel,
  getPartyServiceModel,
} from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import {
  buildPartyProposalRecipientSnapshot,
  buildPartyProposalSenderSnapshot,
  formatPartyProposalAddress,
  normalizePartyProposalPayload,
} from '@helpers/partyProposalCore'

const ensureDocumentsAccess = async (context) => {
  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (access.allowDocuments) return null
  return partyError(
    403,
    'partycrm_documents_tariff_required',
    'Коммерческие предложения недоступны на текущем тарифе',
    'permission'
  )
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const accessError = await ensureDocumentsAccess(context)
  if (accessError) return accessError

  const orderId = String(new URL(req.url).searchParams.get('orderId') || '')
  if (!isValidObjectId(orderId)) {
    return partyError(
      400,
      'partycrm_invalid_order_id',
      'Некорректный id заказа',
      'validation'
    )
  }

  const PartyProposals = await getPartyProposalModel()
  const proposals = await PartyProposals.find({
    tenantId: context.tenantId,
    orderId,
  })
    .sort({ createdAt: -1 })
    .lean()

  return NextResponse.json({ success: true, data: proposals })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const accessError = await ensureDocumentsAccess(context)
  if (accessError) return accessError

  const body = await parseJsonBody(req)
  const orderId = String(body.orderId || '')
  if (!isValidObjectId(orderId)) {
    return partyError(
      400,
      'partycrm_invalid_order_id',
      'Некорректный id заказа',
      'validation'
    )
  }

  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOne({
    _id: orderId,
    tenantId: context.tenantId,
  }).lean()
  if (!order) {
    return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
  }

  const normalized = normalizePartyProposalPayload(body)
  if (normalized.items.length === 0) {
    return partyError(
      400,
      'partycrm_proposal_items_required',
      'Добавьте хотя бы одну услугу',
      'validation'
    )
  }

  const serviceIds = [
    ...new Set(
      normalized.items
        .map((item) => String(item.serviceId || ''))
        .filter(Boolean)
    ),
  ]
  if (serviceIds.some((id) => !isValidObjectId(id))) {
    return partyError(
      400,
      'partycrm_invalid_service_id',
      'Некорректный id услуги',
      'validation'
    )
  }
  if (serviceIds.length > 0) {
    const PartyServices = await getPartyServiceModel()
    const servicesCount = await PartyServices.countDocuments({
      _id: { $in: serviceIds },
      tenantId: context.tenantId,
    })
    if (servicesCount !== serviceIds.length) {
      return partyError(
        400,
        'partycrm_proposal_service_not_found',
        'Одна из услуг не принадлежит выбранной компании',
        'validation'
      )
    }
  }

  let client = null
  if (order.clientId) {
    const PartyClients = await getPartyClientModel()
    client = await PartyClients.findOne({
      _id: order.clientId,
      tenantId: context.tenantId,
    }).lean()
  }

  let locationTitle = ''
  if (order.locationId) {
    const PartyLocations = await getPartyLocationModel()
    const location = await PartyLocations.findOne({
      _id: order.locationId,
      tenantId: context.tenantId,
    })
      .select({ title: 1 })
      .lean()
    locationTitle = location?.title || ''
  }

  const number =
    normalized.number || `КП-${String(order._id).slice(-6).toUpperCase()}`
  const PartyProposals = await getPartyProposalModel()
  const lastVersion = await PartyProposals.findOne({
    tenantId: context.tenantId,
    orderId,
    number,
  })
    .sort({ version: -1 })
    .select({ version: 1 })
    .lean()

  const defaultRecipient = buildPartyProposalRecipientSnapshot(client || order.client)
  const recipientSnapshot = {
    ...defaultRecipient,
    ...normalized.recipientSnapshot,
  }
  const requisites = context.company?.settings?.documents?.requisites || {}
  const senderSnapshot = buildPartyProposalSenderSnapshot(requisites)
  if (!senderSnapshot.displayName) {
    return partyError(
      400,
      'partycrm_company_requisites_required',
      'Заполните реквизиты компании перед созданием КП',
      'validation'
    )
  }

  const eventSnapshot = {
    title: normalized.eventSnapshot.title || order.title || order.serviceTitle,
    date: normalized.eventSnapshot.date || order.eventDate,
    address:
      normalized.eventSnapshot.address ||
      formatPartyProposalAddress(order, locationTitle),
  }

  const proposal = await PartyProposals.create({
    tenantId: context.tenantId,
    orderId,
    clientId: order.clientId || null,
    number,
    version: Number(lastVersion?.version || 0) + 1,
    status: 'draft',
    createdByStaffId: context.staff?._id || null,
    proposalDate: normalized.proposalDate,
    validUntil: normalized.validUntil,
    requestNumber: normalized.requestNumber,
    requestDate: normalized.requestDate,
    senderSnapshot,
    recipientSnapshot,
    eventSnapshot,
    items: normalized.items,
    subtotal: normalized.subtotal,
    discount: normalized.discount,
    total: normalized.total,
    taxText:
      normalized.taxText ||
      'НДС не облагается в связи с применением специального налогового режима.',
    paymentTerms: normalized.paymentTerms,
    includedText: normalized.includedText,
    additionalTerms: normalized.additionalTerms,
  })

  return NextResponse.json(
    { success: true, data: proposal.toObject() },
    { status: 201 }
  )
}
