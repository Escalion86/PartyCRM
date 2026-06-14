import { createPartyGoogleCalendarClient } from './partyGoogleCalendarClient.js'
import { syncPartyOrderToCompanyCalendar } from './partyGoogleCalendarSync.js'

const asArray = (value) => (Array.isArray(value) ? value : [])
const ids = (values) => [...new Set(values.map(String).filter(Boolean))]

const defaultLoadModels = async () => {
  const models = await import('./partyModels.js')
  return {
    Company: await models.getPartyCompanyModel(),
    Order: await models.getPartyOrderModel(),
    Location: await models.getPartyLocationModel(),
    Service: await models.getPartyServiceModel(),
    Staff: await models.getPartyStaffModel(),
    Transaction: await models.getPartyTransactionModel(),
  }
}

const defaultGetAccess = async (company) => {
  const { default: getAccessState } = await import(
    './getPartyCompanyTariffAccess.js'
  )
  return (await getAccessState(company)).access
}

const defaultLoadCompany = async (filter) => {
  const { getPartyCompanyModel } = await import('./partyModels.js')
  return (await getPartyCompanyModel()).findOne(filter).lean()
}

const loadLean = async (query) => query?.lean?.()

const buildDefaultDependencies = async (overrides) => {
  const models = overrides.models || (await (overrides.loadModels || defaultLoadModels)())
  return { ...overrides, models }
}

const persistOrderPatchWith = (Order) => async ({ companyId, orderId, patch }) => {
  await Order.updateOne({ _id: orderId, tenantId: companyId }, { $set: patch })
}

const persistCompanyStateWith = (Company) => async ({
  companyId,
  lastSyncAt,
  lastSyncError,
}) => {
  await Company.updateOne(
    { _id: companyId, tenantId: companyId },
    {
      $set: {
        'settings.googleCalendar.lastSyncAt': lastSyncAt,
        'settings.googleCalendar.lastSyncError': lastSyncError,
      },
    }
  )
}

const credentialsPatch = (credentials = {}) => {
  const fields = {
    access_token: 'accessToken',
    refresh_token: 'refreshToken',
    token_type: 'tokenType',
    scope: 'scope',
    expiry_date: 'expiryDate',
  }
  return Object.entries(fields).reduce((patch, [source, target]) => {
    if (credentials[source] !== undefined) {
      patch[`settings.googleCalendar.${target}`] = credentials[source]
    }
    return patch
  }, {})
}

const persistCredentialsWith = (Company, tenantId) => async (credentials) => {
  const patch = credentialsPatch(credentials)
  if (Object.keys(patch).length === 0) return
  await Company.updateOne(
    { _id: tenantId, tenantId },
    { $set: patch }
  )
}

export const syncPartyOrderCalendarAfterCrud = async ({
  tenantId,
  orderId,
  previousOrder = null,
  dependencies = {},
} = {}) => {
  try {
    if (!tenantId || !orderId) return { ok: false, status: 'hook_failed' }
    const deps = await buildDefaultDependencies(dependencies)
    const { Company, Order, Location, Service, Staff, Transaction } = deps.models
    const company = await loadLean(Company.findOne({ _id: tenantId, tenantId }))
    const order = await loadLean(Order.findOne({ _id: orderId, tenantId }))
    if (!company || !order) return { ok: false, status: 'hook_failed' }

    const serviceIds = ids(asArray(order.servicesIds))
    const staffIds = ids(asArray(order.assignedStaff).map((item) => item?.staffId))
    const [location, services, staff, transactions, access] = await Promise.all([
      order.locationId
        ? loadLean(Location.findOne({ _id: order.locationId, tenantId }))
        : null,
      loadLean(Service.find({ _id: { $in: serviceIds }, tenantId })),
      loadLean(Staff.find({ _id: { $in: staffIds }, tenantId })),
      loadLean(Transaction.find({ orderId, tenantId })),
      (deps.getAccess || defaultGetAccess)(company),
    ])

    const settings = company.settings?.googleCalendar
    const client = (deps.createClient || createPartyGoogleCalendarClient)(settings, {
      onCredentials:
        deps.persistCredentials || persistCredentialsWith(Company, tenantId),
    })
    const syncOrder = deps.syncOrder || syncPartyOrderToCompanyCalendar
    return await syncOrder({
      company,
      order,
      previousOrder,
      access,
      dependencies: {
        client,
        location,
        services: services || [],
        staff: staff || [],
        transactions: transactions || [],
        domain: deps.domain ?? process.env.DOMAIN,
        persistOrderPatch:
          deps.persistOrderPatch || persistOrderPatchWith(Order),
        persistCompanySyncState:
          deps.persistCompanySyncState || persistCompanyStateWith(Company),
      },
    })
  } catch {
    return { ok: false, status: 'hook_failed' }
  }
}

export const deletePartyOrderCalendarEventsAfterCrud = async ({
  tenantId,
  orderSnapshot,
  dependencies = {},
} = {}) => {
  try {
    if (!tenantId || !orderSnapshot || String(orderSnapshot.tenantId) !== String(tenantId)) {
      return { ok: false, status: 'hook_failed' }
    }
    const company = dependencies.loadCompany
      ? await dependencies.loadCompany({ _id: tenantId, tenantId })
      : await defaultLoadCompany({ _id: tenantId, tenantId })
    if (!company) return { ok: false, status: 'hook_failed' }

    const client = (dependencies.createClient || createPartyGoogleCalendarClient)(
      company.settings?.googleCalendar,
      {
        onCredentials:
          dependencies.persistCredentials ||
          (async (credentials) => {
            const models = await defaultLoadModels()
            await persistCredentialsWith(models.Company, tenantId)(credentials)
          }),
      }
    )
    const calendarId = String(orderSnapshot.googleCalendarCalendarId || '')
    if (!client || !calendarId) return { ok: true, deletedCount: 0 }

    const eventIds = ids([
      orderSnapshot.googleCalendarEventId,
      ...asArray(orderSnapshot.additionalEvents).map(
        (item) => item?.googleCalendarEventId
      ),
    ])
    const deleteResults = await Promise.allSettled(
      eventIds.map((eventId) => client.deleteEvent(calendarId, eventId))
    )
    await client.flushCredentialsUpdates?.()
    if (deleteResults.some((result) => result.status === 'rejected')) {
      return { ok: false, status: 'hook_failed' }
    }
    return { ok: true, deletedCount: eventIds.length }
  } catch {
    return { ok: false, status: 'hook_failed' }
  }
}
