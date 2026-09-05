import { getPartyCompanyModel } from './partyModels.js'
import { getPartyInboxStateModel } from './partyInboxModels.js'
import { calculatePartyInboxResponseDueAt, isPartyInboxMeaningfulContent } from '../helpers/partyInboxSla.js'

const eventPush = (event) => ({ $each: [event], $slice: -200 })
const getZone = async (tenantId) => {
  const Company = await getPartyCompanyModel()
  const company = await Company.findOne({ _id: tenantId }).select('settings.timeZone').lean()
  return company?.settings?.timeZone || 'Asia/Krasnoyarsk'
}

export const registerPartyInboxIncoming = async ({ tenantId, channel, sourceId, token, at, text = '', attachments = [], call = false, dependencies = {} }) => {
  if (!tenantId || !sourceId || !token || !isPartyInboxMeaningfulContent({ text, attachments, direction: 'incoming', call })) return null
  const State = dependencies.State || await getPartyInboxStateModel()
  const dueAt = calculatePartyInboxResponseDueAt(at || new Date(), dependencies.timeZone || await getZone(tenantId))
  const receivedAt = new Date(at || Date.now())
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await State.findOne({ tenantId, channel, sourceId }).lean()
    if (current?.slaIncomingToken === String(token)) return current
    if (current?.slaIncomingAt && +new Date(current.slaIncomingAt) > +receivedAt) return current
    const update = { $set: { status: 'needs_reply', slaIncomingToken: String(token), slaIncomingAt: receivedAt, responseDueAt: dueAt, respondedAt: null, responseToken: '' }, $inc: { revision: 1 }, $push: { history: eventPush({ type: 'sla_started', at: receivedAt, token: String(token) }) } }
    if (current) {
      const saved = await State.findOneAndUpdate({ _id: current._id, tenantId, revision: Number(current.revision || 0) }, update, { returnDocument: 'after' }).lean()
      if (saved) return saved
      continue
    }
    try { return (await State.create({ tenantId, channel, sourceId, ...update.$set, revision: 1, history: [{ type: 'sla_started', at: receivedAt, token: String(token) }] })).toObject() }
    catch (error) { if (error?.code !== 11000) throw error }
  }
  throw new Error('Inbox state changed concurrently')
}

export const registerPartyInboxOutgoing = async ({ tenantId, channel, sourceId, token, at, text = '', attachments = [], actorStaffId = null, dependencies = {} }) => {
  if (!tenantId || !sourceId || !token || !isPartyInboxMeaningfulContent({ text, attachments, direction: 'outgoing' })) return null
  const State = dependencies.State || await getPartyInboxStateModel()
  const answeredAt = new Date(at || Date.now())
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await State.findOne({ tenantId, channel, sourceId, responseDueAt: { $ne: null }, respondedAt: null }).lean()
    if (!current || current.responseToken === String(token)) return current
    if (current.slaIncomingAt && +answeredAt < +new Date(current.slaIncomingAt)) return current
    const saved = await State.findOneAndUpdate({ _id: current._id, tenantId, revision: Number(current.revision || 0), slaIncomingToken: current.slaIncomingToken, respondedAt: null }, { $set: { status: current.status === 'needs_reply' ? 'in_progress' : current.status, acknowledgedIncomingToken: current.slaIncomingToken, responseDueAt: null, respondedAt: answeredAt, responseToken: String(token) }, $inc: { revision: 1 }, $push: { history: eventPush({ type: 'sla_answered', at: answeredAt, token: String(token), byStaffId: actorStaffId }) } }, { returnDocument: 'after' }).lean()
    if (saved) return saved
  }
  throw new Error('Inbox state changed concurrently')
}
