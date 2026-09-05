import { getPartyInboxStateModel } from './partyInboxModels.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const pushEvent = (event) => ({ $each: [event], $slice: -200 })
export const serializePartyInboxWorkflow = (state) => ({
  revision: Number(state?.revision || 0), status: state?.status || 'needs_reply',
  assigneeStaffId: state?.assigneeStaffId ? String(state.assigneeStaffId) : null,
  proposedAssigneeStaffId: state?.proposedAssigneeStaffId ? String(state.proposedAssigneeStaffId) : null,
  handoffProposedAt: state?.handoffProposedAt || null, responseDueAt: state?.responseDueAt || null,
  history: (state?.history || []).map((item) => ({ type: item.type, at: item.at, token: item.token || '', byStaffId: item.byStaffId ? String(item.byStaffId) : null, fromStaffId: item.fromStaffId ? String(item.fromStaffId) : null, toStaffId: item.toStaffId ? String(item.toStaffId) : null })),
})

export const changePartyInboxHandoff = async ({ context, channel, sourceId, body, dependencies = {} }) => {
  if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail('Передайте актуальную expectedRevision')
  const State = dependencies.State || await getPartyInboxStateModel()
  const current = await State.findOne({ tenantId: context.tenantId, channel, sourceId }).lean()
  const revision = Number(current?.revision || 0)
  if (revision !== body.expectedRevision) fail('Диалог уже изменён. Обновите данные.', 409)
  const now = new Date()
  const baseFilter = current ? { _id: current._id, tenantId: context.tenantId, revision } : { tenantId: context.tenantId, channel, sourceId, revision: 0 }
  let set
  let event
  if (body.action === 'propose') {
    if (!body.targetStaffId || String(body.targetStaffId) === String(context.staff._id)) fail('Выберите другого менеджера')
    set = { proposedAssigneeStaffId: body.targetStaffId, handoffProposedAt: now, handoffProposedByStaffId: context.staff._id }
    event = { type: 'handoff_proposed', at: now, byStaffId: context.staff._id, fromStaffId: current?.assigneeStaffId || context.staff._id, toStaffId: body.targetStaffId }
  } else if (body.action === 'accept') {
    if (!current?.proposedAssigneeStaffId || String(current.proposedAssigneeStaffId) !== String(context.staff._id)) fail('Передача адресована другому менеджеру', 403)
    set = { assigneeStaffId: context.staff._id, proposedAssigneeStaffId: null, handoffProposedAt: null, handoffProposedByStaffId: null }
    event = { type: 'handoff_accepted', at: now, byStaffId: context.staff._id, fromStaffId: current.assigneeStaffId || null, toStaffId: context.staff._id }
  } else if (body.action === 'cancel') {
    if (!current?.proposedAssigneeStaffId) return serializePartyInboxWorkflow(current)
    set = { proposedAssigneeStaffId: null, handoffProposedAt: null, handoffProposedByStaffId: null }
    event = { type: 'handoff_canceled', at: now, byStaffId: context.staff._id, fromStaffId: current.assigneeStaffId || null, toStaffId: current.proposedAssigneeStaffId }
  } else fail('Некорректное действие передачи')
  const saved = await State.findOneAndUpdate(baseFilter, { $set: set, $setOnInsert: { tenantId: context.tenantId, channel, sourceId }, $inc: { revision: 1 }, $push: { history: pushEvent(event) } }, { upsert: !current, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }).lean()
  if (!saved) fail('Диалог уже изменён. Обновите данные.', 409)
  return serializePartyInboxWorkflow(saved)
}

export const partyInboxHandoffFailure = fail
