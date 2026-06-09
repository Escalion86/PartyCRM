import {
  getPartyClientModel,
  getPartyCompanyModel,
  getPartyOrderModel,
} from '@server/partyModels'
import { sendPushToTenant } from '@server/pushNotifications'
import {
  buildPartyPublicLeadOrderPayload,
  normalizePartyPublicLeadApiKeys,
  normalizePartyPhone,
} from './partyPublicLeadCore'

const buildPublicLeadPushPayload = ({ companyId, order, normalized }) => ({
  title: 'PartyCRM',
  body: `Новая заявка: ${normalized.serviceTitle || normalized.clientName || 'без названия'}`,
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
  const email = String(normalized.email || '').trim().toLowerCase()
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
  const PartyOrders = await getPartyOrderModel()
  const orderPayload = buildPartyPublicLeadOrderPayload({
    clientId: String(client._id),
    normalized,
    rawPayload,
    apiKeyData,
  })
  const order = await PartyOrders.create({
    ...orderPayload,
    tenantId,
  })

  const pushEnabled = company?.settings?.notifications?.pushEnabled === true
  if (pushEnabled) {
    await sendPushToTenant({
      tenantId,
      product: 'partycrm',
      companyId: tenantId,
      source: 'party-public-lead',
      payload: buildPublicLeadPushPayload({
        companyId: tenantId,
        order,
        normalized,
      }),
    })
  }

  return { client, order }
}
