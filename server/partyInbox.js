import {
  getPartyVkConversationModel, getPartyVkMessageModel,
  getPartyAvitoConversationModel, getPartyAvitoMessageModel,
  getPartyTelegramConversationModel, getPartyTelegramMessageModel,
  getPartyCallModel,
} from './partyModels'
import { getPartyInboxStateModel } from './partyInboxModels'
import { partyInboxKey, resolvePartyInboxStatus } from '@helpers/partyInboxCore'
import { getPartyInboxSlaView } from '@helpers/partyInboxSla'

export const partyInboxSources = {
  vk: { source: getPartyVkConversationModel, messages: getPartyVkMessageModel },
  avito: { source: getPartyAvitoConversationModel, messages: getPartyAvitoMessageModel },
  telegram: { source: getPartyTelegramConversationModel, messages: getPartyTelegramMessageModel },
  novofon: { source: getPartyCallModel },
}

export const loadPartyInboxChannel = async ({ tenantId, channel, page = 0 }) => {
  const definition = partyInboxSources[channel]
  const Source = await definition.source()
  const filter = { tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) }
  const sources = await Source.find(filter)
    .select('_id clientId orderId linkedClientId linkedOrderId clientName lastMessageText lastMessageAt unreadCount startedAt phone direction aiSummary createdAt')
    .sort(channel === 'novofon' ? { startedAt: -1, _id: -1 } : { lastMessageAt: -1, _id: -1 })
    .skip(page * 100).limit(101).lean()
  const hasMore = sources.length > 100
  const rows = sources.slice(0, 100)
  const ids = rows.map((row) => row._id)
  const State = await getPartyInboxStateModel()
  const [states, incoming] = await Promise.all([
    State.find({ tenantId, channel, sourceId: { $in: ids } }).lean(),
    definition.messages ? (async () => {
      const Messages = await definition.messages()
      // Aggregation does not cast ObjectIds, hence use tenantId from source documents.
      const typedTenantId = Source.schema.path('tenantId').cast(tenantId)
      return Messages.aggregate([
        { $match: { tenantId: typedTenantId, conversationId: { $in: ids }, direction: 'incoming' } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: '$conversationId', messageId: { $first: '$_id' } } },
      ])
    })() : [],
  ])
  const statesById = new Map(states.map((state) => [String(state.sourceId), state]))
  const tokens = new Map(incoming.map((message) => [String(message._id), String(message.messageId)]))
  return { hasMore, items: rows.map((row) => {
    const sourceId = String(row._id)
    const state = statesById.get(sourceId)
    const incomingToken = channel === 'novofon' ? (row.direction === 'incoming' ? sourceId : '') : tokens.get(sourceId) || ''
    const sla = getPartyInboxSlaView(state)
    return {
      id: partyInboxKey(channel, sourceId), channel, sourceId,
      title: row.clientName || row.phone || `Диалог ${channel}`,
      preview: row.lastMessageText || row.aiSummary || (channel === 'novofon' ? 'Телефонный звонок' : ''),
      lastActivityAt: row.lastMessageAt || row.startedAt || row.createdAt,
      incomingToken,
      status: resolvePartyInboxStatus(state, incomingToken, row.direction),
      nextContactAt: state?.nextContactAt || null,
      assigneeStaffId: state?.assigneeStaffId ? String(state.assigneeStaffId) : '',
      proposedAssigneeStaffId: state?.proposedAssigneeStaffId ? String(state.proposedAssigneeStaffId) : '',
      handoffProposedAt: state?.handoffProposedAt || null,
      revision: Number(state?.revision || 0),
      responseDueAt: sla.responseDueAt,
      overdue: sla.overdue,
      slaOpen: sla.slaOpen,
      clientId: String((state ? state.clientId : row.clientId || row.linkedClientId) || ''),
      orderId: String((state ? state.orderId : row.orderId || row.linkedOrderId) || ''),
    }
  }) }
}
