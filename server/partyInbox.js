import {
  getPartyVkConversationModel, getPartyVkMessageModel,
  getPartyAvitoConversationModel, getPartyAvitoMessageModel,
  getPartyTelegramConversationModel, getPartyTelegramMessageModel,
  getPartyCallModel, getPartyClientModel,
} from './partyModels'
import { getPartyInboxStateModel } from './partyInboxModels'
import { partyInboxKey, resolvePartyInboxOrderId, resolvePartyInboxStatus } from '@helpers/partyInboxCore'
import { getPartyInboxSlaView } from '@helpers/partyInboxSla'
import { buildPartyInboxChannelPipeline, buildPartyInboxOverduePipeline } from '@helpers/partyInboxQuery'

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

export const mapPartyInboxItem = ({ row, state, channel, tokens, now, resolvedIncomingToken }) => {
  const sourceId = String(row._id)
  const incomingToken = resolvedIncomingToken ?? (channel === 'novofon' ? (row.direction === 'incoming' ? sourceId : '') : tokens?.get(sourceId) || '')
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
    orderId: resolvePartyInboxOrderId(state, row),
    sourceOrderId: resolvePartyInboxOrderId(null, row),
  }
}

export const loadPartyInboxOverdue = async ({ tenantId, channels, page = 0, salesStage = '', search = '', status = '', now = new Date() }) => {
  if (!channels.length) return { hasMore: false, items: [] }
  const [State, models, Clients] = await Promise.all([
    getPartyInboxStateModel(),
    Promise.all(channels.map(async (channel) => {
      const definition = partyInboxSources[channel]
      const [Source, Messages] = await Promise.all([definition.source(), search || status ? definition.messages?.() : undefined])
      return { channel, Source, Messages }
    })),
    search ? getPartyClientModel() : undefined,
  ])
  const states = await State.aggregate(buildPartyInboxOverduePipeline({
    tenantId: State.schema.path('tenantId').cast(tenantId),
    sources: models.map(({ channel, Source, Messages }) => ({ channel, collectionName: Source.collection.name, messagesCollectionName: Messages?.collection.name })),
    clientCollectionName: Clients?.collection.name, page, salesStage, search, status, now,
  }))
  const rows = states.slice(0, 100)
  const tokensByChannel = status ? null : new Map(await Promise.all(models.map(async ({ channel, Source }) => [channel, await loadIncomingTokens({
    definition: partyInboxSources[channel], Source, tenantId,
    ids: rows.filter((state) => state.channel === channel).map((state) => state.sourceId),
  })])))
  return {
    hasMore: states.length > 100,
    items: rows.map((state) => mapPartyInboxItem({ row: state.sourceRow, state, channel: state.channel, tokens: tokensByChannel?.get(state.channel), resolvedIncomingToken: state.inboxIncomingToken, now })),
  }
}

export const loadPartyInboxChannel = async ({ tenantId, channel, page = 0, salesStage = '', search = '', status = '' }) => {
  const definition = partyInboxSources[channel]
  const [Source, State, Messages, Clients] = await Promise.all([
    definition.source(), getPartyInboxStateModel(),
    search || status ? definition.messages?.() : undefined,
    search ? getPartyClientModel() : undefined,
  ])
  const filtered = Boolean(salesStage || search || status)
  const filter = { tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) }
  const sources = filtered ? await Source.aggregate(buildPartyInboxChannelPipeline({
    tenantId: Source.schema.path('tenantId').cast(tenantId), channel,
    stateCollectionName: State.collection.name, messagesCollectionName: Messages?.collection.name,
    clientCollectionName: Clients?.collection.name, salesStage, search, status, page,
  })) : await Source.find(filter)
    .select('_id clientId orderId linkedClientId linkedOrderId clientName lastMessageText lastMessageAt unreadCount startedAt phone direction aiSummary createdAt')
    .sort(channel === 'novofon' ? { startedAt: -1, _id: -1 } : { lastMessageAt: -1, _id: -1 })
    .skip(page * 100).limit(101).lean()
  const hasMore = sources.length > 100
  const rows = sources.slice(0, 100)
  const ids = rows.map((row) => row._id)
  const [states, tokens] = await Promise.all([
    filtered ? rows.flatMap((row) => row.inboxState ? [row.inboxState] : []) : State.find({ tenantId, channel, sourceId: { $in: ids } }).lean(),
    status ? undefined : loadIncomingTokens({ definition, Source, tenantId, ids }),
  ])
  const statesById = new Map(states.map((state) => [String(state.sourceId), state]))
  return { hasMore, items: rows.map((row) => mapPartyInboxItem({ row, state: statesById.get(String(row._id)), channel, tokens, resolvedIncomingToken: row.inboxIncomingToken })) }
}
