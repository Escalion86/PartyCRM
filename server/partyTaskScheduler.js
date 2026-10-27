import { getPartyTaskModel, withPartyTaskSeriesMutation } from './partyTaskModels'
import { getPartyCompanyModel, getPartyOrderModel } from './partyModels'
import { nextPartyTaskOccurrence } from '../helpers/partyTasks'
import { syncPartyTaskEffects } from './partyTaskEffects'
import { ensurePartyOrderTasks } from './partyTasks'

export const createPartyTaskScheduler = ({ getTasks = getPartyTaskModel, getOrders = getPartyOrderModel, getCompanies = getPartyCompanyModel, mutateSeries = withPartyTaskSeriesMutation, nextOccurrence = nextPartyTaskOccurrence, syncEffects = syncPartyTaskEffects, migrateOrderTasks = ensurePartyOrderTasks } = {}) => async ({ now = new Date() } = {}) => {
  const [Tasks, Orders, Companies] = await Promise.all([getTasks(), getOrders(), getCompanies()])
  await Tasks.init()
  const horizon = new Date(now.getTime() + 7 * 86400000)
  const series = await Tasks.find({ seriesActive: true, seriesId: null, nextOccurrenceAt: { $lte: horizon, $ne: null } }).sort({ nextOccurrenceAt: 1 }).limit(100).lean()
  let generated = 0
  let reminded = 0
  let failed = 0
  for (const root of series) {
    for (let index = 0; index < 50; index += 1) {
      let outcome
      try {
        outcome = await mutateSeries({ Tasks, tenantId: root.tenantId, taskId: root._id, work: async ({ session, task: current }) => {
          const occurrenceAt = current.nextOccurrenceAt && new Date(current.nextOccurrenceAt)
          if (!current.seriesActive || current.seriesId || !occurrenceAt || occurrenceAt > horizon || !Number.isFinite(occurrenceAt.getTime())) return null
          const template = current.seriesTemplate || current
          if (template.orderId) {
            // A transaction write on the order serializes against its cancellation.
            const orderLock = await Orders.updateOne({ _id: template.orderId, tenantId: current.tenantId, status: { $in: ['draft', 'active'] } }, { $inc: { taskScheduleRevision: 1 } }, { session })
            if (!orderLock.matchedCount) {
              await Tasks.updateOne({ _id: current._id, tenantId: current.tenantId }, { $set: { seriesActive: false, nextOccurrenceAt: null } }, { session })
              return null
            }
          }
          const key = { tenantId: current.tenantId, seriesId: current._id, seriesGeneration: current.seriesGeneration || 0, occurrenceAt }
          const completed = await Tasks.exists({ tenantId: current.tenantId, seriesId: current._id, occurrenceAt, status: 'done' }).session(session)
          const result = completed ? {} : await Tasks.updateOne(key, { $setOnInsert: {
            ...key, title: template.title, descriptionHtml: template.descriptionHtml, status: 'new',
            orderId: template.orderId, locationId: template.locationId,
            assigneeStaffIds: template.assigneeStaffIds, assigneeRoleId: template.assigneeRoleId,
            mediaSourceTaskId: current.seriesTemplateMediaTaskId || current._id,
            createdByStaffId: current.createdByStaffId, createdByUserId: current.createdByUserId, dueAt: occurrenceAt,
            timeZone: current.timeZone, recurrence: { frequency: 'none', interval: 1, until: null },
            seriesActive: false, effectsPending: true,
            history: [{ action: 'recurrence_created', at: now, staffId: current.createdByStaffId, userId: current.createdByUserId, toStatus: 'new' }],
          } }, { upsert: true, session })
          const next = nextOccurrence({ after: occurrenceAt, recurrence: current.recurrence, timeZone: current.timeZone, anchorDay: current.recurrenceAnchorDay })
          await Tasks.updateOne({ _id: current._id, tenantId: current.tenantId }, { $set: { nextOccurrenceAt: next, ...(!next ? { seriesActive: false } : {}) } }, { session })
          return { taskId: result.upsertedId || null, next }
        } })
      } catch { failed += 1; break }
      if (!outcome) break
      if (outcome.taskId) {
        generated += 1
        const effect = await syncEffects({ tenantId: root.tenantId, taskId: outcome.taskId, event: 'assigned' })
        if (effect?.failed) failed += 1
      }
      if (!outcome.next || new Date(outcome.next) > horizon) break
    }
  }
  const companies = await Companies.find({ status: { $ne: 'archived' } }).select('_id status settings.timeZone settings.notifications').lean()
  for (const company of companies) {
    let dateKey
    try { dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: company.settings?.timeZone || 'Europe/Moscow' }).format(now) }
    catch { failed += 1; continue }
    if (company.status === 'active') {
      let legacyCursor = null
      for (let page = 0; page < 20; page += 1) {
        const legacy = await Orders.find({ tenantId: company._id, status: { $in: ['draft', 'active'] }, ...(legacyCursor ? { _id: { $gt: legacyCursor } } : {}), $or: [{ 'additionalEvents.0': { $exists: true } }, { 'preparation.items.0': { $exists: true } }] }).sort({ _id: 1 }).limit(100).lean()
        for (const order of legacy) await migrateOrderTasks({ tenantId: company._id, order })
        if (legacy.length < 100) break
        legacyCursor = legacy.at(-1)._id
      }
      const due = await Tasks.find({ tenantId: company._id, status: { $in: ['new', 'in_progress'] }, dueAt: { $ne: null, $lte: now }, 'reminders.dateKey': { $ne: dateKey } }).sort({ dueAt: 1, _id: 1 }).limit(100).lean()
      for (const task of due) {
        const claimed = await Tasks.updateOne({ _id: task._id, tenantId: company._id, status: { $in: ['new', 'in_progress'] }, dueAt: { $ne: null, $lte: now }, 'reminders.dateKey': { $ne: dateKey } }, { $push: { reminders: { $each: [{ dateKey }], $slice: -366 } } })
        if (!claimed.modifiedCount) continue
        const effect = await syncEffects({ tenantId: company._id, taskId: task._id, event: 'reminder' })
        if (effect?.pushFailed && !effect.notified) await Tasks.updateOne({ _id: task._id, tenantId: company._id }, { $pull: { reminders: { dateKey } } })
        else reminded += 1
      }
    }
    // Paginate the whole set: a permanent first page must not starve later tasks
    // or leave calendar projections behind after access revocation/cancellation.
    let cursor = null
    for (let page = 0; page < 20; page += 1) {
      const filter = { tenantId: company._id, ...(cursor ? { _id: { $gt: cursor } } : {}), $or: [
        { status: { $in: ['new', 'in_progress'] } }, { effectsPending: true }, { 'calendarLinks.0': { $exists: true } },
      ] }
      const pending = await Tasks.find(filter).sort({ _id: 1 }).limit(100).select('_id').lean()
      for (const task of pending) await syncEffects({ tenantId: company._id, taskId: task._id, notify: false })
      if (pending.length < 100) break
      cursor = pending[pending.length - 1]._id
    }
  }
  return { generated, reminded, failed }
}

export const runPartyTaskScheduler = createPartyTaskScheduler()
