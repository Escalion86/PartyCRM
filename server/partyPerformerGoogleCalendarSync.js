import { createPartyGoogleCalendarClient } from './partyGoogleCalendarClient.js'
import { normalizePartyGoogleCalendarSettings } from './partyGoogleCalendarSettings.js'
import { buildPartyPerformerGoogleCalendarPayload } from '../helpers/partyPerformerCalendar.js'
import { sanitizePartyOrderForPerformer } from '../helpers/partyPerformerOrders.js'

const asArray = (value) => (Array.isArray(value) ? value : [])
const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '')
const acceptedStatuses = new Set(['confirmed', 'done'])

const hasCredentials = (settings) =>
  Boolean(settings.accessToken || settings.refreshToken)

const isAvailable = ({ settings, client }) =>
  settings.enabled && hasCredentials(settings) && settings.calendarId && client

const deleteEventBestEffort = async ({ client, calendarId, eventId }) => {
  if (!client || !calendarId || !eventId) return
  try {
    await client.deleteEvent(calendarId, eventId)
  } catch {
    // Personal performer calendar cleanup must not block order flows.
  }
}

const upsertEvent = async ({ client, calendarId, eventId, payload }) => {
  if (!eventId) {
    const created = await client.insertEvent(calendarId, payload)
    return String(created?.id || '')
  }
  try {
    const updated = await client.updateEvent(calendarId, eventId, payload)
    return String(updated?.id || eventId)
  } catch (error) {
    if (error?.code !== 'event_missing' && error?.status !== 404) throw error
    const created = await client.insertEvent(calendarId, payload)
    return String(created?.id || '')
  }
}

const defaultLoadModels = async () => {
  const models = await import('./partyModels.js')
  return {
    Company: await models.getPartyCompanyModel(),
    Order: await models.getPartyOrderModel(),
    Location: await models.getPartyLocationModel(),
    Service: await models.getPartyServiceModel(),
    Staff: await models.getPartyStaffModel(),
    Client: await models.getPartyClientModel(),
    User: await models.getPartyUserModel(),
  }
}

const persistCredentialsPatch = (credentials = {}) => {
  const fields = {
    access_token: 'accessToken',
    refresh_token: 'refreshToken',
    token_type: 'tokenType',
    scope: 'scope',
    expiry_date: 'expiryDate',
  }
  return Object.entries(fields).reduce((patch, [source, target]) => {
    if (credentials[source] !== undefined) {
      patch[`performerSettings.googleCalendar.${target}`] = credentials[source]
    }
    return patch
  }, {})
}

const updateAssignment = async ({ Order, order, staffId, patch }) => {
  const set = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [`assignedStaff.$.${key}`, value])
  )
  await Order.updateOne(
    {
      _id: order._id,
      tenantId: order.tenantId,
      'assignedStaff.staffId': staffId,
    },
    { $set: set }
  )
}

export const syncPartyOrderToPerformerCalendars = async ({
  tenantId,
  orderId,
  dependencies = {},
} = {}) => {
  try {
    if (!tenantId || !orderId) return { ok: false, status: 'hook_failed' }
    const models = dependencies.models || (await defaultLoadModels())
    const { Company, Order, Location, Service, Staff, Client, User } = models
    const order = await Order.findOne({ _id: orderId, tenantId }).lean()
    if (!order) return { ok: false, status: 'hook_failed' }

    const assignments = asArray(order.assignedStaff).filter((item) =>
      idOf(item?.staffId)
    )
    if (assignments.length === 0) return { ok: true, synced: 0, skipped: 0 }

    const staffIds = assignments.map((item) => idOf(item.staffId))
    const [company, staff, location, services, client] = await Promise.all([
      Company.findOne({ _id: tenantId, tenantId }).lean(),
      Staff.find({
        _id: { $in: staffIds },
        tenantId,
        status: { $ne: 'archived' },
      }).lean(),
      order.locationId
        ? Location.findOne({ _id: order.locationId, tenantId }).lean()
        : null,
      Service.find({ _id: { $in: asArray(order.servicesIds) }, tenantId }).lean(),
      order.clientId ? Client.findOne({ _id: order.clientId }).lean() : null,
    ])
    const staffById = new Map(staff.map((item) => [idOf(item), item]))
    const userIds = [
      ...new Set(
        staff
          .map((item) => String(item.linkedAuthUserId || item.authUserId || ''))
          .filter(Boolean)
      ),
    ]
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds }, status: 'active' }).lean()
      : []
    const usersById = new Map(users.map((item) => [idOf(item), item]))
    const locationsById = new Map(
      location ? [[`${String(tenantId)}:${idOf(location)}`, location]] : []
    )
    const clientsById = new Map(client ? [[idOf(client), client]] : [])
    const servicesById = new Map(services.map((item) => [idOf(item), item]))

    let synced = 0
    let skipped = 0
    for (const assignment of assignments) {
      const staffId = idOf(assignment.staffId)
      const staffItem = staffById.get(staffId)
      const userId = String(staffItem?.linkedAuthUserId || staffItem?.authUserId || '')
      const user = usersById.get(userId)
      const settings = normalizePartyGoogleCalendarSettings(
        user?.performerSettings?.googleCalendar
      )
      const clientInstance = user
        ? (dependencies.createClient || createPartyGoogleCalendarClient)(settings, {
            onCredentials: async (credentials) => {
              const patch = persistCredentialsPatch(credentials)
              if (Object.keys(patch).length > 0) {
                await User.updateOne({ _id: userId }, { $set: patch })
              }
            },
          })
        : null
      const shouldSync =
        order.status !== 'canceled' &&
        order.status !== 'closed' &&
        acceptedStatuses.has(String(assignment.confirmationStatus || 'pending'))
      const oldCalendarId =
        String(assignment.performerGoogleCalendarCalendarId || '') ||
        settings.calendarId
      const oldEventId = String(assignment.performerGoogleCalendarEventId || '')

      if (!shouldSync || !isAvailable({ settings, client: clientInstance })) {
        if (!shouldSync && oldEventId) {
          await deleteEventBestEffort({
            client: clientInstance,
            calendarId: oldCalendarId,
            eventId: oldEventId,
          })
          await updateAssignment({
            Order,
            order,
            staffId,
            patch: {
              performerGoogleCalendarEventId: '',
              performerGoogleCalendarCalendarId: '',
              performerCalendarSyncedAt: new Date(),
              performerCalendarSyncError: '',
            },
          })
        } else if (shouldSync) {
          await updateAssignment({
            Order,
            order,
            staffId,
            patch: { performerCalendarSyncError: 'calendar_sync_unavailable' },
          })
        }
        skipped += 1
        continue
      }

      const calendarChanged = oldEventId && oldCalendarId !== settings.calendarId
      if (calendarChanged) {
        await deleteEventBestEffort({
          client: clientInstance,
          calendarId: oldCalendarId,
          eventId: oldEventId,
        })
      }
      const sanitizedOrder = sanitizePartyOrderForPerformer({
        order,
        membership: {
          staffId,
          tenantId: String(tenantId),
          role: staffItem?.role || 'performer',
          company: { title: company?.title || 'Компания' },
        },
        locationsById,
        clientsById,
        servicesById,
      })
      const payload = buildPartyPerformerGoogleCalendarPayload({
        order: sanitizedOrder,
        settings,
      })
      if (!payload) {
        skipped += 1
        continue
      }
      try {
        const eventId = await upsertEvent({
          client: clientInstance,
          calendarId: settings.calendarId,
          eventId: calendarChanged ? '' : oldEventId,
          payload,
        })
        await clientInstance.flushCredentialsUpdates?.()
        await updateAssignment({
          Order,
          order,
          staffId,
          patch: {
            performerGoogleCalendarEventId: eventId,
            performerGoogleCalendarCalendarId: eventId ? settings.calendarId : '',
            performerCalendarSyncedAt: new Date(),
            performerCalendarSyncError: '',
          },
        })
        synced += 1
      } catch {
        await updateAssignment({
          Order,
          order,
          staffId,
          patch: { performerCalendarSyncError: 'calendar_sync_failed' },
        })
        skipped += 1
      }
    }

    return { ok: true, synced, skipped }
  } catch {
    return { ok: false, status: 'hook_failed' }
  }
}

export const deletePartyOrderPerformerCalendarEventsAfterCrud = async ({
  tenantId,
  orderSnapshot,
  dependencies = {},
} = {}) => {
  try {
    if (!tenantId || !orderSnapshot || String(orderSnapshot.tenantId) !== String(tenantId)) {
      return { ok: false, status: 'hook_failed' }
    }
    const assignments = asArray(orderSnapshot.assignedStaff).filter(
      (item) => item?.performerGoogleCalendarEventId
    )
    if (assignments.length === 0) return { ok: true, deletedCount: 0 }

    const models = dependencies.models || (await defaultLoadModels())
    const { Staff, User } = models
    const staffIds = assignments.map((item) => idOf(item.staffId))
    const staff = await Staff.find({
      _id: { $in: staffIds },
      tenantId,
      status: { $ne: 'archived' },
    }).lean()
    const staffById = new Map(staff.map((item) => [idOf(item), item]))
    const userIds = [
      ...new Set(
        staff
          .map((item) => String(item.linkedAuthUserId || item.authUserId || ''))
          .filter(Boolean)
      ),
    ]
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds }, status: 'active' }).lean()
      : []
    const usersById = new Map(users.map((item) => [idOf(item), item]))
    let deletedCount = 0

    for (const assignment of assignments) {
      const staffItem = staffById.get(idOf(assignment.staffId))
      const userId = String(staffItem?.linkedAuthUserId || staffItem?.authUserId || '')
      const user = usersById.get(userId)
      const settings = normalizePartyGoogleCalendarSettings(
        user?.performerSettings?.googleCalendar
      )
      const clientInstance = user
        ? (dependencies.createClient || createPartyGoogleCalendarClient)(settings)
        : null
      const calendarId =
        String(assignment.performerGoogleCalendarCalendarId || '') ||
        settings.calendarId
      if (!clientInstance || !calendarId) continue
      await deleteEventBestEffort({
        client: clientInstance,
        calendarId,
        eventId: String(assignment.performerGoogleCalendarEventId || ''),
      })
      await clientInstance.flushCredentialsUpdates?.()
      deletedCount += 1
    }

    return { ok: true, deletedCount }
  } catch {
    return { ok: false, status: 'hook_failed' }
  }
}
