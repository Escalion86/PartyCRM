import {
  isPartyGoogleCalendarEventMissingError,
} from './partyGoogleCalendarClient.js'
import {
  buildPartyAdditionalCalendarPayload,
  buildPartyOrderCalendarPayload,
} from './partyGoogleCalendarPayload.js'
import { normalizePartyGoogleCalendarSettings } from './partyGoogleCalendarSettings.js'

const asArray = (value) => (Array.isArray(value) ? value : [])

const idOf = (value) => String(value?._id ?? value?.id ?? '')

const plainObject = (value) => {
  if (!value || typeof value !== 'object') return value
  if (typeof value.toObject === 'function') return value.toObject()
  return { ...value }
}

const isMissing = (error) =>
  isPartyGoogleCalendarEventMissingError(error) ||
  error?.code === 'event_missing' ||
  error?.status === 404

const persistPatch = async ({ company, order, patch, dependencies }) => {
  if (typeof dependencies.persistOrderPatch !== 'function') return
  await dependencies.persistOrderPatch({
    companyId: idOf(company),
    orderId: idOf(order),
    patch,
  })
}

const persistPatchBestEffort = async (context) => {
  try {
    await persistPatch(context)
  } catch {
    // Sync remains best-effort when persistence is temporarily unavailable.
  }
}

const persistCompanyStateBestEffort = async ({
  company,
  lastSyncAt,
  lastSyncError,
  dependencies,
}) => {
  if (typeof dependencies.persistCompanySyncState !== 'function') return
  try {
    await dependencies.persistCompanySyncState({
      companyId: idOf(company),
      lastSyncAt,
      lastSyncError,
    })
  } catch {
    // Company diagnostics must not break order CRUD flows.
  }
}

const deleteEventIfPresent = async ({ client, calendarId, eventId }) => {
  if (!calendarId || !eventId) return
  try {
    await client.deleteEvent(calendarId, eventId)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

const deleteEventBestEffort = async (context) => {
  try {
    await deleteEventIfPresent(context)
  } catch {
    // Used only for cleanup where a stale event is preferable to blocking sync.
  }
}

const upsertEvent = async ({ client, calendarId, eventId, payload }) => {
  if (!payload) return ''
  if (!eventId) {
    const created = await client.insertEvent(calendarId, payload)
    return String(created?.id || '')
  }
  try {
    const updated = await client.updateEvent(calendarId, eventId, payload)
    return String(updated?.id || eventId)
  } catch (error) {
    if (!isMissing(error)) throw error
    const created = await client.insertEvent(calendarId, payload)
    return String(created?.id || '')
  }
}

const flushCredentials = async (client) => {
  if (typeof client?.flushCredentialsUpdates === 'function') {
    await client.flushCredentialsUpdates()
  }
}

const hasCredentials = (settings) =>
  Boolean(settings.accessToken || settings.refreshToken)

const getSettings = (company) =>
  normalizePartyGoogleCalendarSettings(company?.settings?.googleCalendar)

const isAvailable = ({ settings, access, client }) =>
  access?.allowCalendarSync === true &&
  settings.enabled &&
  hasCredentials(settings) &&
  Boolean(settings.calendarId) &&
  Boolean(client)

const baseSuccessPatch = (now) => ({
  calendarSyncError: '',
  calendarSyncedAt: now,
})

const additionalPatch = (items, eventIds) =>
  items.map((item) => ({
    ...plainObject(item),
    googleCalendarEventId: eventIds.get(idOf(item)) || '',
  }))

export const syncPartyOrderToCompanyCalendar = async ({
  company,
  order,
  previousOrder,
  access,
  dependencies = {},
} = {}) => {
  const settings = getSettings(company)
  const client = dependencies.client
  const now =
    typeof dependencies.now === 'function' ? dependencies.now() : new Date()

  if (!isAvailable({ settings, access, client })) {
    const orderPatch = { calendarSyncError: 'calendar_sync_unavailable' }
    await persistPatch({ company, order, patch: orderPatch, dependencies })
    await persistCompanyStateBestEffort({
      company,
      lastSyncAt: null,
      lastSyncError: 'calendar_sync_unavailable',
      dependencies,
    })
    return { ok: false, status: 'unavailable', orderPatch }
  }

  const calendarId = settings.calendarId
  const oldCalendarId =
    String(order?.googleCalendarCalendarId || previousOrder?.googleCalendarCalendarId || '') ||
    calendarId
  const currentAdditional = asArray(order?.additionalEvents)
  const previousAdditional = asArray(previousOrder?.additionalEvents)
  const eventIds = new Map(
    currentAdditional.map((item) => [idOf(item), String(item?.googleCalendarEventId || '')])
  )
  let failureIdentityPatch = {}

  try {
    const calendarChanged =
      Boolean(order?.googleCalendarCalendarId) && oldCalendarId !== calendarId

    if (calendarChanged) {
      await deleteEventBestEffort({
        client,
        calendarId: oldCalendarId,
        eventId: order.googleCalendarEventId,
      })
      for (const item of currentAdditional) {
        await deleteEventBestEffort({
          client,
          calendarId: oldCalendarId,
          eventId: item?.googleCalendarEventId,
        })
        eventIds.set(idOf(item), '')
      }
    }

    if (order?.status === 'canceled' && settings.deleteCanceledFromCalendar) {
      await deleteEventIfPresent({
        client,
        calendarId: oldCalendarId,
        eventId: order?.googleCalendarEventId,
      })
      for (const item of currentAdditional) {
        await deleteEventIfPresent({
          client,
          calendarId: oldCalendarId,
          eventId: item?.googleCalendarEventId,
        })
        eventIds.set(idOf(item), '')
      }
      await flushCredentials(client)
      const orderPatch = {
        googleCalendarEventId: '',
        googleCalendarCalendarId: '',
        additionalEvents: additionalPatch(currentAdditional, eventIds),
        ...baseSuccessPatch(now),
      }
      await persistPatch({ company, order, patch: orderPatch, dependencies })
      await persistCompanyStateBestEffort({
        company,
        lastSyncAt: now,
        lastSyncError: '',
        dependencies,
      })
      return { ok: true, status: 'deleted', orderPatch }
    }

    const buildOrderPayload =
      dependencies.buildOrderPayload || buildPartyOrderCalendarPayload
    const mainPayload = buildOrderPayload({
      order,
      settings,
      company,
      transactions: dependencies.transactions,
      location: dependencies.location,
      services: dependencies.services,
      staff: dependencies.staff,
      domain: dependencies.domain,
    })
    let mainEventId = ''
    if (mainPayload) {
      mainEventId = await upsertEvent({
        client,
        calendarId,
        eventId: calendarChanged ? '' : String(order?.googleCalendarEventId || ''),
        payload: mainPayload,
      })
    } else if (!calendarChanged && order?.googleCalendarEventId) {
      failureIdentityPatch = {
        googleCalendarEventId: String(order.googleCalendarEventId),
        googleCalendarCalendarId: oldCalendarId,
      }
      await deleteEventIfPresent({
        client,
        calendarId,
        eventId: order.googleCalendarEventId,
      })
      failureIdentityPatch = {}
    }

    const deletedEventIds = new Set()
    const removeAdditional = async (item, sourceCalendarId = oldCalendarId) => {
      const eventId = String(item?.googleCalendarEventId || '')
      if (!eventId || deletedEventIds.has(eventId)) return
      await deleteEventIfPresent({ client, calendarId: sourceCalendarId, eventId })
      deletedEventIds.add(eventId)
    }

    const currentIds = new Set(currentAdditional.map(idOf).filter(Boolean))
    for (const item of previousAdditional) {
      if (!currentIds.has(idOf(item))) await removeAdditional(item)
    }

    const allowAdditional =
      settings.syncSettings.showAdditionalEvents && order?.status !== 'canceled'
    const buildAdditionalPayload =
      dependencies.buildAdditionalPayload || buildPartyAdditionalCalendarPayload

    for (const item of currentAdditional) {
      const itemId = idOf(item)
      const shouldRemove = !allowAdditional || item?.done === true || !item?.date
      if (shouldRemove) {
        await removeAdditional(item, calendarChanged ? oldCalendarId : calendarId)
        eventIds.set(itemId, '')
        continue
      }
      const payload = buildAdditionalPayload({
        item,
        orderContext: { order, location: dependencies.location },
        settings,
        company,
        domain: dependencies.domain,
      })
      if (!payload) {
        await removeAdditional(item, calendarChanged ? oldCalendarId : calendarId)
        eventIds.set(itemId, '')
        continue
      }
      const eventId = await upsertEvent({
        client,
        calendarId,
        eventId: calendarChanged ? '' : eventIds.get(itemId),
        payload,
      })
      eventIds.set(itemId, eventId)
    }

    await flushCredentials(client)
    const orderPatch = {
      googleCalendarEventId: mainEventId,
      googleCalendarCalendarId: mainEventId ? calendarId : '',
      additionalEvents: additionalPatch(currentAdditional, eventIds),
      ...baseSuccessPatch(now),
    }
    await persistPatch({ company, order, patch: orderPatch, dependencies })
    await persistCompanyStateBestEffort({
      company,
      lastSyncAt: now,
      lastSyncError: '',
      dependencies,
    })
    return { ok: true, status: 'synced', orderPatch }
  } catch {
    try {
      await flushCredentials(client)
    } catch {
      // The public result intentionally contains no upstream error details.
    }
    const orderPatch = {
      ...failureIdentityPatch,
      calendarSyncError: 'calendar_sync_failed',
    }
    await persistPatchBestEffort({ company, order, patch: orderPatch, dependencies })
    await persistCompanyStateBestEffort({
      company,
      lastSyncAt: null,
      lastSyncError: 'calendar_sync_failed',
      dependencies,
    })
    return { ok: false, status: 'failed', orderPatch }
  }
}
