import { createHash, randomUUID } from 'node:crypto'
import { getPartyTaskModel } from './partyTaskModels'
import { getPartyCompanyModel, getPartyStaffModel, getPartyUserModel, getPartyRoleModel, getPartyOrderModel } from './partyModels'
import { canPartyAccess } from '../helpers/partyRolePermissions'
import { isPartyTaskAssignee, isPartyTaskOpen, taskIdOf, PARTY_TASK_STATUSES } from '../helpers/partyTasks'
import { normalizePartyGoogleCalendarSettings } from './partyGoogleCalendarSettings'
import { createPartyGoogleCalendarClient } from './partyGoogleCalendarClient'
import { sendPushToTenant } from './pushNotifications'
import { canAccessTaskLocation } from './partyTasks'

export const partyTaskCalendarEventId = (taskId, staffId) => `t${createHash('sha256').update(`${taskId}:${staffId}`).digest('hex').slice(0, 40)}`
const missing = (error) => error?.code === 'event_missing' || Number(error?.status || error?.code || error?.response?.status) === 404
const conflict = (error) => Number(error?.status || error?.code || error?.response?.status) === 409

export const createPartyTaskRecipientLoader = ({ getStaff = getPartyStaffModel, getRoles = getPartyRoleModel, getCompany = getPartyCompanyModel, getUsers = getPartyUserModel, getOrders = getPartyOrderModel, canAccess = canPartyAccess, canAccessLocation = canAccessTaskLocation } = {}) => async ({ tenantId, task }) => {
  const [Staff, Roles, Company, User, Orders] = await Promise.all([getStaff(), getRoles(), getCompany(), getUsers(), getOrders()])
  const [staff, roles, company, order] = await Promise.all([
    Staff.find({ tenantId, $or: [
      { _id: { $in: [...(task.assigneeStaffIds || []), ...(task.calendarLinks || []).map((link) => link.staffId)] } },
      ...(task.assigneeRoleId ? [{ positionId: task.assigneeRoleId }, { positionId: null }] : []),
    ] }).lean(),
    Roles.find({ tenantId }).lean(), Company.findOne({ _id: tenantId }).lean(),
    task.orderId ? Orders.findOne({ _id: task.orderId, tenantId }).lean() : null,
  ])
  // Inactive users are needed only to remove projections left in their calendars.
  const userIds = [...new Set([...staff.map((person) => person.authUserId || person.linkedAuthUserId), ...(task.calendarLinks || []).map((link) => link.userId)].filter(Boolean).map(String))]
  const users = await User.find({ _id: { $in: userIds } }).lean()
  const userById = new Map(users.map((user) => [taskIdOf(user), user]))
  const recipients = staff.map((person) => {
    const position = roles.find((role) => person.positionId ? taskIdOf(role) === taskIdOf(person.positionId) : role.systemKey === person.role)
    const context = { tenantId, staff: person, role: person.role, position, company }
    const assigned = isPartyTaskAssignee(task, { ...person, positionId: person.positionId || position?._id })
    const membershipAllowed = assigned && company?.status === 'active' && person.status === 'active' && canAccess(context, { resource: 'tasks' })
    const locationAllowed = canAccessLocation(context, task, order)
    const orderAllowed = !task.orderId || Boolean(order && canAccess(context, { resource: 'orders', order }))
    return { staff: person, user: userById.get(taskIdOf(person.authUserId || person.linkedAuthUserId)), assigned, allowed: membershipAllowed && locationAllowed && orderAllowed, canReceiveCancellation: membershipAllowed, orderOpen: !task.orderId || Boolean(order && !['canceled', 'closed'].includes(order.status)) }
  })
  const seen = new Set(recipients.map(({ staff, user }) => `${taskIdOf(staff)}:${taskIdOf(user)}`))
  for (const link of task.calendarLinks || []) {
    const pair = `${taskIdOf(link.staffId)}:${taskIdOf(link.userId)}`
    const legacyCurrentOwner = !link.userId && recipients.some(({ staff, user }) => taskIdOf(staff) === taskIdOf(link.staffId) && user?.performerSettings?.googleCalendar?.calendarId === link.calendarId)
    if (seen.has(pair) || legacyCurrentOwner) continue
    seen.add(pair)
    recipients.push({ staff: { _id: link.staffId, tenantId, status: 'archived' }, user: userById.get(taskIdOf(link.userId)), assigned: false, allowed: false, canReceiveCancellation: false, orderOpen: false })
  }
  return { company, order, recipients }
}

export const loadPartyTaskRecipients = createPartyTaskRecipientLoader()

export const createPartyTaskPushAuthorizer = ({ getTasks = getPartyTaskModel, loadRecipients = loadPartyTaskRecipients } = {}) => async ({ tenantId, taskId, targetUserId, event }) => {
  if (!/^[a-f\d]{24}$/i.test(String(taskId || '')) || !targetUserId) return { authorized: false }
  const Tasks = await getTasks()
  const task = await Tasks.findOne({ _id: taskId, tenantId }).lean()
  if (!task) return { authorized: false }
  const { company, recipients } = await loadRecipients({ tenantId, task })
  const recipient = recipients.find((entry) => taskIdOf(entry.user) === String(targetUserId) && entry.user.status === 'active' && (event === 'canceled' ? entry.canReceiveCancellation : entry.allowed))
  if (!recipient || company?.settings?.notifications?.pushEnabled !== true || recipient.user.performerSettings?.notifications?.pushEnabled === false) return { authorized: false }
  const applicable = event === 'canceled' ? task.status === 'canceled' : event === 'done' ? task.status === 'done' : isPartyTaskOpen(task) && recipient.orderOpen !== false
  if (!applicable) return { authorized: false }
  return { authorized: true, generic: event === 'canceled' && !recipient.allowed }
}

export const authorizePartyTaskPushTarget = createPartyTaskPushAuthorizer()

export const createPartyTaskEffects = ({ getTasks = getPartyTaskModel, getUsers = getPartyUserModel, loadRecipients = loadPartyTaskRecipients, normalizeSettings = normalizePartyGoogleCalendarSettings, createCalendarClient = createPartyGoogleCalendarClient, sendPush = sendPushToTenant, clock = () => new Date(), tokenFactory = randomUUID } = {}) => async ({ tenantId, taskId, event = '', notify = true }) => {
  const totals = { synced: 0, failed: 0, notified: 0, pushFailed: 0 }
  let Tasks
  let token
  let locked = false
  try {
    Tasks = await getTasks()
    const initial = await Tasks.findOne({ _id: taskId, tenantId }).lean()
    if (!initial) return totals
    if (notify && event) await Tasks.updateOne({ _id: taskId, tenantId }, { $set: { effectsPending: true }, $addToSet: { pendingNotifications: { key: `${initial.revision || 0}:${event}`, revision: initial.revision || 0, event } } })
    token = tokenFactory()
    const now = clock()
    const claimed = await Tasks.findOneAndUpdate({ _id: taskId, tenantId, $or: [{ effectsLockUntil: null }, { effectsLockUntil: { $lte: now } }] }, { $set: { effectsLockToken: token, effectsLockUntil: new Date(now.getTime() + 300000) } }, { new: true }).lean()
    if (!claimed) {
      await Tasks.updateOne({ _id: taskId, tenantId }, { $set: { effectsPending: true } })
      return { ...totals, queued: true }
    }
    locked = true
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await Tasks.updateOne({ _id: taskId, tenantId, effectsLockToken: token }, { $set: { effectsPending: false } })
      const task = await Tasks.findOne({ _id: taskId, tenantId, effectsLockToken: token }).lean()
      if (!task) break
      const { company, recipients } = await loadRecipients({ tenantId, task })
      const links = []
      let iterationFailed = false
      const notificationFailed = new Set()
      for (const { staff, user, allowed, canReceiveCancellation, orderOpen = true } of [...recipients].sort((first, second) => Number(first.allowed) - Number(second.allowed))) {
        const settings = normalizeSettings(user?.performerSettings?.googleCalendar)
        const prior = (task.calendarLinks || []).filter((link) => taskIdOf(link.staffId) === taskIdOf(staff) && (link.userId ? taskIdOf(link.userId) === taskIdOf(user) : !user || link.calendarId === settings.calendarId))
        const userActive = user && user.status === 'active'
        const hasCredentials = Boolean(settings.refreshToken || settings.accessToken)
        const client = user && hasCredentials ? createCalendarClient(settings, { onCredentials: async (credentials) => {
          const Users = await getUsers()
          const fields = { access_token: 'accessToken', refresh_token: 'refreshToken', token_type: 'tokenType', scope: 'scope', expiry_date: 'expiryDate' }
          const patch = Object.fromEntries(Object.entries(fields).filter(([source]) => credentials[source] !== undefined).map(([source, target]) => [`performerSettings.googleCalendar.${target}`, credentials[source]]))
          if (Object.keys(patch).length) {
            const result = await Users.updateOne({ _id: user._id, 'performerSettings.googleCalendar.refreshToken': settings.refreshToken || '' }, { $set: patch })
            if (!result.matchedCount) throw new Error('credentials_save_failed')
          }
        } }) : null
        const wantsSync = Boolean(allowed && userActive && orderOpen && isPartyTaskOpen(task) && task.dueAt && settings.enabled && settings.calendarId)
        const shouldSync = Boolean(wantsSync && client)
        const eventId = partyTaskCalendarEventId(task._id, staff._id)
        const currentLink = { staffId: staff._id, userId: user?._id || null, calendarId: settings.calendarId || '', eventId, error: '' }
        if (wantsSync && !client) {
          iterationFailed = true; totals.failed += 1
          links.push({ ...currentLink, error: 'calendar_sync_unavailable' })
        }
        // Also remove a deterministic projection after a crashed writer which did
        // not manage to save its calendar link before cancellation.
        const cleanup = [...prior]
        if (!shouldSync && client && settings.calendarId && !cleanup.some((link) => link.calendarId === settings.calendarId && link.eventId === eventId)) cleanup.push(currentLink)
        for (const previous of cleanup) {
          if (shouldSync && previous.calendarId === settings.calendarId && previous.eventId === eventId) continue
          if (!previous.eventId || !previous.calendarId) continue
          try {
            if (!client) throw new Error('calendar_sync_unavailable')
            try { await client.deleteEvent(previous.calendarId, previous.eventId) } catch (error) { if (!missing(error)) throw error }
          } catch {
            iterationFailed = true; totals.failed += 1
            links.push({ ...previous, userId: previous.userId || user?._id || null, error: 'calendar_sync_failed' })
          }
        }
        if (shouldSync) {
          try {
            const due = new Date(task.dueAt)
            if (!Number.isFinite(due.getTime())) throw new Error('invalid_task_deadline')
            const domain = String(process.env.DOMAIN || '').replace(/\/$/, '')
            const payload = {
              summary: `Задача: ${task.title}`,
              description: `${PARTY_TASK_STATUSES[task.status]}\nОткрыть задачу в CRM: ${domain}/performer/tasks?task=${task._id}`,
              start: { dateTime: due.toISOString(), timeZone: task.timeZone },
              end: { dateTime: new Date(due.getTime() + 30 * 60000).toISOString(), timeZone: task.timeZone }, reminders: settings.reminders,
            }
            try { await client.updateEvent(settings.calendarId, eventId, payload) }
            catch (error) {
              if (!missing(error)) throw error
              try { await client.insertEvent(settings.calendarId, { ...payload, id: eventId }) }
              catch (insertError) { if (!conflict(insertError)) throw insertError; await client.updateEvent(settings.calendarId, eventId, payload) }
            }
            links.push(currentLink); totals.synced += 1
          } catch {
            iterationFailed = true; totals.failed += 1
            links.push({ ...currentLink, error: 'calendar_sync_failed' })
          }
        }
        try { await client?.flushCredentialsUpdates?.() }
        catch { iterationFailed = true; totals.failed += 1 }
        const beforeNotify = await Tasks.findOne({ _id: taskId, tenantId, effectsLockToken: token }).lean()
        if (!beforeNotify || beforeNotify.revision !== task.revision) continue
        for (const notification of task.pendingNotifications || []) {
          const kind = notification.event
          const cancellation = kind === 'canceled'
          const eligible = cancellation ? canReceiveCancellation : allowed
          const applicable = kind === 'reminder' ? isPartyTaskOpen(task) && orderOpen : kind === 'done' ? task.status === 'done' : kind === 'canceled' ? task.status === 'canceled' : isPartyTaskOpen(task)
          if (!eligible || !applicable || !userActive || company?.settings?.notifications?.pushEnabled !== true || user.performerSettings?.notifications?.pushEnabled === false) continue
          try {
            const push = await sendPush({ tenantId, companyId: tenantId, product: 'partycrm', source: 'party-task', targetUserId: String(user._id), userId: String(user._id), authorizedTaskTarget: { taskId: String(task._id), event: kind }, payload: {
              title: kind === 'done' ? 'Задача выполнена' : cancellation ? 'Задача отменена' : kind === 'reminder' ? 'Напоминание о задаче' : 'Задача обновлена',
              body: allowed ? task.title : 'Задача по заказу отменена', tag: `party-task-${task._id}-${notification.key}`,
              data: { type: 'party-task', url: '/performer/tasks', companyId: String(tenantId), taskId: String(task._id) },
            } })
            if (push?.failed || push?.ok === false && push?.reason !== 'no_vapid') throw new Error('push_delivery_failed')
            totals.notified += Number(push?.sent || 0)
          } catch { notificationFailed.add(notification.key); totals.pushFailed += 1; totals.failed += 1 }
        }
      }
      // The lease permits one projection writer. Store links even if content was
      // edited meanwhile, then immediately project the newest content. Otherwise
      // an unassignment during the request could lose the old user's cleanup link.
      const consumed = (task.pendingNotifications || []).filter((item) => !notificationFailed.has(item.key)).map((item) => item.key)
      const uniqueLinks = [...new Map(links.map((link) => [`${link.staffId}:${link.calendarId}:${link.eventId}`, link])).values()]
      await Tasks.updateOne({ _id: taskId, tenantId, effectsLockToken: token }, { $set: { calendarLinks: uniqueLinks, ...(iterationFailed || notificationFailed.size ? { effectsPending: true } : {}) }, ...(consumed.length ? { $pull: { pendingNotifications: { key: { $in: consumed } } } } : {}) })
      const latest = await Tasks.findOne({ _id: taskId, tenantId, effectsLockToken: token }).lean()
      if (!latest || latest.revision === task.revision && !latest.effectsPending && !(latest.pendingNotifications || []).length) break
      if (iterationFailed || notificationFailed.size) break
    }
    return totals
  } catch { return { ...totals, failed: totals.failed + 1 } }
  finally {
    if (locked) await Tasks.updateOne({ _id: taskId, tenantId, effectsLockToken: token }, { $set: { effectsLockToken: '', effectsLockUntil: null } }).catch(() => undefined)
  }
}

export const syncPartyTaskEffects = createPartyTaskEffects()
