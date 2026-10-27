import {
  getPartyClientModel,
  getPartyCompanyModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyServiceModel,
} from '@server/partyModels'
import { sendPartyOrderScopedPush } from './partyOrderPermissionPush'
import { syncPartyOrderInventory } from './partyInventory'
import { withPartyOrderVenueWrite } from './partyVenueBookings'
import {
  buildPartyPublicLeadOrderPayload,
  normalizePartyPublicLeadApiKeys,
  normalizePartyPhone,
  resolvePartyPublicLeadRouting,
} from './partyPublicLeadCore'

const buildPublicLeadPushPayload = ({ companyId, order, normalized }) => ({
  title: 'PartyCRM',
  body: `Новая заявка${order?.leadMeta?.bookingNeedsReview ? ' — согласуйте время' : ''}: ${normalized.serviceTitle || normalized.clientName || 'без названия'}`,
  tag: `party-lead-${String(order?._id || Date.now())}`,
  data: {
    type: 'party_public_lead',
    companyId: String(companyId || ''),
    orderId: String(order?._id || ''),
    url: '/company/orders',
  },
})

export const resolvePartyPublicLeadCompany = async (apiKey) => {
  if (!apiKey) {
    return { ok: false, status: 401, error: 'API key обязателен' }
  }

  const PartyCompanies = await getPartyCompanyModel()
  const companies = await PartyCompanies.find({
    status: { $ne: 'archived' },
    $or: [
      { 'settings.publicLeadApiKey': apiKey },
      { 'settings.publicLeadApiKeys.key': apiKey },
    ],
  })
    .select({ title: 1, settings: 1 })
    .lean()

  for (const company of companies) {
    const settings = company?.settings ?? {}
    if (settings.publicLeadEnabled !== true) continue
    const apiKeyData = normalizePartyPublicLeadApiKeys(settings).find(
      (item) => item.key === apiKey
    )
    if (!apiKeyData) continue
    if (apiKeyData.enabled === false) {
      return { ok: false, status: 403, error: 'API key отключен' }
    }
    return { ok: true, company, apiKeyData }
  }

  return { ok: false, status: 403, error: 'Неверный API key' }
}

export const upsertPartyPublicLeadClient = async ({ tenantId, normalized }) => {
  const PartyClients = await getPartyClientModel()
  const phone = normalizePartyPhone(normalized.phone)
  const email = String(normalized.email || '')
    .trim()
    .toLowerCase()
  const query = phone
    ? { tenantId, phone, status: { $ne: 'archived' } }
    : email
      ? { tenantId, email, status: { $ne: 'archived' } }
      : null

  let client = query ? await PartyClients.findOne(query) : null
  if (!client) {
    return PartyClients.create({
      tenantId,
      firstName: normalized.clientName || 'Новый клиент',
      phone,
      whatsapp: normalized.whatsapp,
      telegram: normalized.telegram,
      email,
      leadSource: normalized.source,
      town: normalized.town,
      comment: normalized.comment,
    })
  }

  let changed = false
  if (normalized.clientName && !client.firstName) {
    client.firstName = normalized.clientName
    changed = true
  }
  if (phone && !client.phone) {
    client.phone = phone
    changed = true
  }
  if (normalized.whatsapp && !client.whatsapp) {
    client.whatsapp = normalized.whatsapp
    changed = true
  }
  if (normalized.telegram && !client.telegram) {
    client.telegram = normalized.telegram
    changed = true
  }
  if (email && !client.email) {
    client.email = email
    changed = true
  }
  if (normalized.source && !client.leadSource) {
    client.leadSource = normalized.source
    changed = true
  }
  if (normalized.town && !client.town) {
    client.town = normalized.town
    changed = true
  }
  if (changed) await client.save()

  return client
}

export const createPartyPublicLeadOrder = async ({
  company,
  normalized,
  rawPayload,
  apiKeyData,
}) => {
  const tenantId = company._id
  const client = await upsertPartyPublicLeadClient({ tenantId, normalized })
  const [PartyOrders, PartyLocations, PartyServices] = await Promise.all([
    getPartyOrderModel(),
    getPartyLocationModel(),
    getPartyServiceModel(),
  ])
  const [locations, services] = await Promise.all([
    PartyLocations.find({ tenantId, status: 'active' })
      .select({ _id: 1, title: 1, status: 1 })
      .lean(),
    PartyServices.find({ tenantId, status: 'active' })
      .select({ _id: 1, title: 1, status: 1 })
      .lean(),
  ])
  const routing = resolvePartyPublicLeadRouting({
    normalized,
    settings: company?.settings ?? {},
    locations,
    services,
  })
  const orderPayload = buildPartyPublicLeadOrderPayload({
    clientId: String(client._id),
    normalized,
    rawPayload,
    apiKeyData,
    routing,
  })
  const payload = {
    ...orderPayload,
    workflowStageId: company?.settings?.workflow?.initialStageId || 'new',
    tenantId,
  }
  const saveOrder = (nextPayload) =>
    withPartyOrderVenueWrite({
      tenantId,
      nextOrder: nextPayload,
      work: async ({ session }) =>
        session
          ? (await PartyOrders.create([nextPayload], { session }))[0]
          : PartyOrders.create({ ...nextPayload, tenantId }),
    })
  let order,
    bookingNeedsReview = false
  try {
    order = await saveOrder(payload)
  } catch (cause) {
    const unavailableCodes = [
      'partycrm_venue_transaction_required',
      'partycrm_venue_topology_unavailable',
      'partycrm_venue_lock_required',
    ]
    const reason =
      cause.code === 'partycrm_venue_conflict'
        ? 'occupied'
        : cause.status === 503 && unavailableCodes.includes(cause.code)
          ? 'storage_unavailable'
          : ''
    if (!reason) throw cause
    const requestedBooking = {
      eventDate: payload.eventDate,
      dateEnd: payload.dateEnd,
      locationId: payload.locationId,
      reason,
      originalAdminComment: payload.adminComment || '',
    }
    const requestedDate = (value) => {
      if (!value) return 'не указано'
      try {
        return new Date(value).toLocaleString('ru-RU', {
          timeZone: company.settings?.timeZone || 'Asia/Krasnoyarsk',
        })
      } catch {
        return new Date(value).toISOString()
      }
    }
    const note = `Запрошено: ${requestedDate(payload.eventDate)} — ${requestedDate(payload.dateEnd)}. ${reason === 'occupied' ? 'Помещение занято, согласуйте время с клиентом.' : 'Не удалось проверить занятость площадки по технической причине; согласуйте время после восстановления проверки.'} Время не забронировано.`
    const fallback = {
      ...payload,
      status: 'draft',
      eventDate: null,
      dateEnd: null,
      adminComment: `${note}\n\n${payload.adminComment || ''}`
        .trim()
        .slice(0, 2000),
      leadMeta: {
        ...payload.leadMeta,
        bookingNeedsReview: true,
        requestedBooking,
      },
    }
    // An inquiry with no event interval creates no venue reservation. Keep the
    // original request intact for a later ordinary, guarded scheduling PATCH.
    order = await saveOrder(fallback)
    bookingNeedsReview = true
  }

  // Keep shortage details inside the company: public lead responses expose
  // only their own order identifier, never other customers or reservations.
  await syncPartyOrderInventory({ tenantId, order, staffId: null })

  const pushEnabled = company?.settings?.notifications?.pushEnabled === true
  if (pushEnabled) {
    await sendPartyOrderScopedPush({
      tenantId,
      company,
      order,
      source: 'party-public-lead',
      payload: buildPublicLeadPushPayload({
        companyId: tenantId,
        order,
        normalized,
      }),
    })
  }

  return { client, order, bookingNeedsReview }
}
