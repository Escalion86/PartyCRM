import {
  getPartyVkConversationModel, getPartyVkMessageModel,
  getPartyAvitoConversationModel, getPartyAvitoMessageModel,
  getPartyTelegramConversationModel, getPartyTelegramMessageModel,
  getPartyCallModel,
} from './partyModels'
import { getPartyInboxStateModel } from './partyInboxModels'
import { partyInboxKey, resolvePartyInboxStatus } from '@helpers/partyInboxCore'
import { getPartyInboxSlaView } from '@helpers/partyInboxSla'
import { buildPartyInboxOverduePipeline, buildPartyInboxSalesStagePipeline } from '@helpers/partyInboxQuery'

export const partyInboxSources = {
  vk: { source: getPartyVkConversationModel, messages: getPartyVkMessageModel },
  avito: { source: getPartyAvitoConversationModel, messages: getPartyAvitoMessageModel },
  telegram: { source: getPartyTelegramConversationModel, messages: getPartyTelegramMessageModel },
  novofon: { source: getPartyCallModel },
}

const loadIncomingTokens = async ({ definition, Source, tenantId, ids }) => {
  if (!definition.messages || !ids.length) return new Map()
  const Messages = await definition.messages()
  // Aggregations do not cast ObjectIds automatically.
  const typedTenantId = Source.schema.path('tenantId').cast(tenantId)
  const incoming = await Messages.aggregate([
    { $match: { tenantId: typedTenantId, conversationId: { $in: ids }, direction: 'incoming' } },
    { $sort: { sentAt: -1, _id: -1 } },
    { $group: { _id: '$conversationId', messageId: { $first: '$_id' } } },
  ])
  return new Map(incoming.map((message) => [String(message._id), String(message.messageId)]))
}

const mapPartyInboxItem = ({ row, state, channel, tokens, now }) => {
  const sourceId = String(row._id)
  const incomingToken = channel === 'novofon' ? (row.direction === 'incoming' ? sourceId : '') : tokens.get(sourceId) || ''
  const sla = getPartyInboxSlaView(state, now)
  return {
    id: partyInboxKey(channel, sourceId), channel, sourceId,
    title: row.clientName || row.phone || `Диалог ${channel}`,
    preview: row.lastMessageText || row.aiSummary || (channel === 'novofon' ? 'Телефонный звонок' : ''),
    lastActivityAt: row.lastMessageAt || row.startedAt || row.createdAt,
    incomingToken,
    status: resolvePartyInboxStatus(state, incomingToken, row.direction),
    salesStage: state?.salesStage || 'new',
    lostReason: state?.lostReason || '',
    nextContactAt: state?.nextContactAt || null,
    assigneeStaffId: state?.assigneeStaffId ? String(state.assigneeStaffId) : '',
    proposedAssigneeStaffId: state?.proposedAssigneeStaffId ? String(state.proposedAssigneeStaffId) : '',
    handoffProposedAt: state?.handoffProposedAt || null,
    revision: Number(state?.revision || 0),
    responseDueAt: sla.responseDueAt,
    overdue: sla.overdue,
    overdueAt: state?.overdueAt || null,
    slaOpen: sla.slaOpen,
    clientId: String((state ? state.clientId : row.clientId || row.linkedClientId) || ''),
    orderId: String((state ? state.orderId : row.orderId || row.linkedOrderId) || ''),
  }
}

export const loadPartyInboxOverdue = async ({ tenantId, channels, page = 0, salesStage = '', now = new Date() }) => {
  if (!channels.length) return { hasMore: false, items: [] }
  const [State, models] = await Promise.all([
    getPartyInboxStateModel(),
    Promise.all(channels.map(async (channel) => ({ channel, Source: await partyInboxSources[channel].source() }))),
  ])
  const states = await State.aggregate(buildPartyInboxOverduePipeline({
    tenantId: State.schema.path('tenantId').cast(tenantId),
    sources: models.map(({ channel, Source }) => ({ channel, collectionName: Source.collection.name })),
    page, salesStage, now,
  }))
  const rows = states.slice(0, 100)
  const tokensByChannel = new Map(await Promise.all(models.map(async ({ channel, Source }) => [channel, await loadIncomingTokens({
    definition: partyInboxSources[channel], Source, tenantId,
    ids: rows.filter((state) => state.channel === channel).map((state) => state.sourceId),
  })])))
  return {
    hasMore: states.length > 100,
    items: rows.map((state) => mapPartyInboxItem({ row: state.sourceRow, state, channel: state.channel, tokens: tokensByChannel.get(state.channel), now })),
  }
}

export const loadPartyInboxChannel = async ({ tenantId, channel, page = 0, salesStage = '' }) => {
  const definition = partyInboxSources[channel]
  const [Source, State] = await Promise.all([definition.source(), getPartyInboxStateModel()])
  const filter = { tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) }
  const sources = salesStage ? await Source.aggregate(buildPartyInboxSalesStagePipeline({
    tenantId: Source.schema.path('tenantId').cast(tenantId), channel,
    stateCollectionName: State.collection.name, salesStage, page,
  })) : await Source.find(filter)
    .select('_id clientId orderId linkedClientId linkedOrderId clientName lastMessageText lastMessageAt unreadCount startedAt phone direction aiSummary createdAt')
    .sort(channel === 'novofon' ? { startedAt: -1, _id: -1 } : { lastMessageAt: -1, _id: -1 })
    .skip(page * 100).limit(101).lean()
  const hasMore = sources.length > 100
  const rows = sources.slice(0, 100)
  const ids = rows.map((row) => row._id)
  const [states, tokens] = await Promise.all([
    salesStage ? rows.flatMap((row) => row.inboxState ? [row.inboxState] : []) : State.find({ tenantId, channel, sourceId: { $in: ids } }).lean(),
    loadIncomingTokens({ definition, Source, tenantId, ids }),
  ])
  const statesById = new Map(states.map((state) => [String(state.sourceId), state]))
  return { hasMore, items: rows.map((row) => mapPartyInboxItem({ row, state: statesById.get(String(row._id)), channel, tokens })) }
}
