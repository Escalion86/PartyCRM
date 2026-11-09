const slaIsOverdue = (now) => ({
  $and: [
    { $eq: [{ $type: '$responseDueAt' }, 'date'] },
    { $lt: ['$responseDueAt', now] },
    { $eq: [{ $ifNull: ['$respondedAt', null] }, null] },
  ],
})

const contactIsOverdue = (now) => ({
  $and: [
    { $eq: [{ $type: '$nextContactAt' }, 'date'] },
    { $lt: ['$nextContactAt', now] },
    { $ne: ['$status', 'resolved'] },
  ],
})

const literalSearch = (value) => ({ $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' })

const phoneSearch = (value) => {
  const digits = value.replace(/\D/g, '')
  if (!/^[\d\s()+.-]+$/.test(value) || digits.length < 3) return null
  const parts = [...digits]
  if (parts.length === 11 && /^[78]$/.test(parts[0])) parts[0] = '[78]'
  return { $regex: parts.join('[^0-9]*') }
}

const messageLookup = ({ tenantId, channel, messagesCollectionName, sourcePath, match, latest = false }) => ({
  $lookup: {
    from: messagesCollectionName,
    let: { sourceId: `$${sourcePath}_id`, ...(sourcePath ? { channel: '$channel' } : {}) },
    pipeline: [
      { $match: {
        tenantId,
        ...match,
        $expr: sourcePath
          ? { $and: [{ $eq: ['$conversationId', '$$sourceId'] }, { $eq: ['$$channel', channel] }] }
          : { $eq: ['$conversationId', '$$sourceId'] },
      } },
      ...(latest ? [{ $sort: { sentAt: -1, _id: -1 } }] : []),
      { $limit: 1 },
      { $project: { _id: 1 } },
    ],
    as: `${latest ? '_incoming' : '_matchingMessage'}_${channel}`,
  },
})

const buildSearchStages = ({ tenantId, sources, clientCollectionName, search, sourcePath, statePath }) => {
  if (!search) return []
  const text = literalSearch(search)
  const phone = phoneSearch(search) || text
  const messageSources = sources.filter(({ messagesCollectionName }) => messagesCollectionName)
  return [
    { $lookup: {
      from: clientCollectionName,
      let: { clientId: statePath ? { $cond: [
        { $ne: [{ $ifNull: ['$inboxState', null] }, null] },
        '$inboxState.clientId',
        { $ifNull: ['$clientId', '$linkedClientId'] },
      ] } : '$clientId' },
      pipeline: [
        { $match: {
          tenantId,
          $expr: { $eq: ['$_id', '$$clientId'] },
          $or: [
            { firstName: text }, { secondName: text }, { thirdName: text }, { phone },
            { $expr: { $regexMatch: {
              input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$secondName', ''] }, ' ', { $ifNull: ['$thirdName', ''] }] },
              regex: text.$regex, options: text.$options,
            } } },
          ],
        } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ],
      as: '_matchingClient',
    } },
    ...messageSources.map((source) => messageLookup({ ...source, tenantId, sourcePath, match: { text } })),
    { $match: { $or: [
      ...['clientName', 'lastMessageText', 'aiSummary', 'transcript', 'orderDraft.client.name'].map((field) => ({ [`${sourcePath}${field}`]: text })),
      ...['phone', 'normalizedPhone', 'orderDraft.client.phone'].map((field) => ({ [`${sourcePath}${field}`]: phone })),
      { '_matchingClient.0': { $exists: true } },
      ...messageSources.map(({ channel }) => ({ [`_matchingMessage_${channel}.0`]: { $exists: true } })),
    ] } },
    { $unset: ['_matchingClient', ...messageSources.map(({ channel }) => `_matchingMessage_${channel}`)] },
  ]
}

const buildStatusStages = ({ tenantId, sources, status, sourcePath, statePath }) => {
  if (!status) return []
  const messageSources = sources.filter(({ messagesCollectionName }) => messagesCollectionName)
  const direction = `$${sourcePath}direction`
  const isCall = sourcePath ? { $eq: ['$channel', 'novofon'] } : sources[0].channel === 'novofon'
  const latestIncoming = messageSources.map(({ channel }) => `$_incoming_${channel}._id`)
  const messageToken = latestIncoming.length ? { $arrayElemAt: [{ $concatArrays: latestIncoming }, 0] } : null
  const stateStatus = { $ifNull: [`$${statePath}status`, ''] }
  return [
    ...messageSources.map((source) => messageLookup({ ...source, tenantId, sourcePath, match: { direction: 'incoming' }, latest: true })),
    { $set: { inboxIncomingToken: { $ifNull: [{ $toString: { $cond: [
      isCall,
      { $cond: [{ $eq: [direction, 'incoming'] }, `$${sourcePath}_id`, null] },
      messageToken,
    ] } }, ''] } } },
    { $match: { $expr: { $eq: [{ $cond: [
      { $and: [
        { $ne: ['$inboxIncomingToken', ''] },
        { $ne: ['$inboxIncomingToken', { $ifNull: [`$${statePath}acknowledgedIncomingToken`, ''] }] },
      ] },
      'needs_reply',
      { $cond: [{ $ne: [stateStatus, ''] }, stateStatus, { $cond: [{ $eq: [direction, 'outgoing'] }, 'in_progress', 'needs_reply'] }] },
    ] }, status] } } },
    ...(messageSources.length ? [{ $unset: messageSources.map(({ channel }) => `_incoming_${channel}`) }] : []),
  ]
}

// Start from conversations so historical sources without State remain "new".
// Joining and filtering happen before skip/limit, including for the first stage.
export const buildPartyInboxChannelPipeline = ({ tenantId, channel, stateCollectionName, messagesCollectionName, clientCollectionName, salesStage = '', search = '', status = '', page = 0, limit = 100 }) => [
  { $match: { tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) } },
  { $lookup: {
    from: stateCollectionName,
    let: { sourceId: '$_id' },
    pipeline: [
      { $match: { tenantId, channel, $expr: { $eq: ['$sourceId', '$$sourceId'] } } },
      { $project: { history: 0 } },
    ],
    as: '_inboxStates',
  } },
  { $set: { inboxState: { $arrayElemAt: ['$_inboxStates', 0] } } },
  ...(salesStage ? [{ $match: { $expr: { $eq: [{ $ifNull: ['$inboxState.salesStage', 'new'] }, salesStage] } } }] : []),
  ...buildSearchStages({ tenantId, sources: [{ channel, messagesCollectionName }], clientCollectionName, search, sourcePath: '', statePath: 'inboxState.' }),
  ...buildStatusStages({ tenantId, sources: [{ channel, messagesCollectionName }], status, sourcePath: '', statePath: 'inboxState.' }),
  { $sort: channel === 'novofon' ? { startedAt: -1, _id: -1 } : { lastMessageAt: -1, _id: -1 } },
  { $skip: page * limit },
  { $limit: limit + 1 },
  { $unset: '_inboxStates' },
]

// Source existence and tenant ownership are checked before pagination. Historical
// conversations without an inbox state/deadline cannot be inferred by this query.
export const buildPartyInboxOverduePipeline = ({ tenantId, sources, clientCollectionName, now = new Date(), page = 0, limit = 100, salesStage = '', search = '', status = '' }) => [
  { $match: {
    tenantId,
    channel: { $in: sources.map(({ channel }) => channel) },
    $or: [
      { responseDueAt: { $type: 'date', $lt: now }, respondedAt: null },
      { nextContactAt: { $type: 'date', $lt: now }, status: { $ne: 'resolved' } },
    ],
    ...(salesStage ? { $expr: { $eq: [{ $ifNull: ['$salesStage', 'new'] }, salesStage] } } : {}),
  } },
  { $set: { overdueAt: { $cond: [
    slaIsOverdue(now),
    { $cond: [contactIsOverdue(now), { $min: ['$responseDueAt', '$nextContactAt'] }, '$responseDueAt'] },
    '$nextContactAt',
  ] } } },
  ...sources.map(({ channel, collectionName }) => ({ $lookup: {
    from: collectionName,
    let: { sourceId: '$sourceId', channel: '$channel' },
    pipeline: [
      { $match: {
        tenantId,
        ...(channel === 'novofon' ? { provider: 'novofon' } : {}),
        $expr: { $and: [{ $eq: ['$_id', '$$sourceId'] }, { $eq: ['$$channel', channel] }] },
      } },
      { $project: {
        _id: 1, clientId: 1, orderId: 1, linkedClientId: 1, linkedOrderId: 1,
        clientName: 1, lastMessageText: 1, lastMessageAt: 1, unreadCount: 1,
        startedAt: 1, phone: 1, direction: 1, aiSummary: 1, createdAt: 1,
        ...(search && channel === 'novofon' ? { transcript: 1, normalizedPhone: 1, orderDraft: 1 } : {}),
      } },
    ],
    as: `_source_${channel}`,
  } })),
  { $set: { sourceRow: { $arrayElemAt: [{ $concatArrays: sources.map(({ channel }) => `$_source_${channel}`) }, 0] } } },
  { $match: { 'sourceRow._id': { $exists: true } } },
  ...buildSearchStages({ tenantId, sources, clientCollectionName, search, sourcePath: 'sourceRow.', statePath: '' }),
  ...buildStatusStages({ tenantId, sources, status, sourcePath: 'sourceRow.', statePath: '' }),
  { $sort: { overdueAt: 1, _id: 1 } },
  { $skip: page * limit },
  { $limit: limit + 1 },
  { $unset: ['history', ...sources.map(({ channel }) => `_source_${channel}`)] },
]
