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

// Start from conversations so historical sources without State remain "new".
// Joining and filtering happen before skip/limit, including for the first stage.
export const buildPartyInboxSalesStagePipeline = ({ tenantId, channel, stateCollectionName, salesStage, page = 0, limit = 100 }) => [
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
  { $match: { $expr: { $eq: [{ $ifNull: ['$inboxState.salesStage', 'new'] }, salesStage] } } },
  { $sort: channel === 'novofon' ? { startedAt: -1, _id: -1 } : { lastMessageAt: -1, _id: -1 } },
  { $skip: page * limit },
  { $limit: limit + 1 },
  { $unset: '_inboxStates' },
]

// Source existence and tenant ownership are checked before pagination. Historical
// conversations without an inbox state/deadline cannot be inferred by this query.
export const buildPartyInboxOverduePipeline = ({ tenantId, sources, now = new Date(), page = 0, limit = 100, salesStage = '' }) => [
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
      } },
    ],
    as: `_source_${channel}`,
  } })),
  { $set: { sourceRow: { $arrayElemAt: [{ $concatArrays: sources.map(({ channel }) => `$_source_${channel}`) }, 0] } } },
  { $match: { 'sourceRow._id': { $exists: true } } },
  { $sort: { overdueAt: 1, _id: 1 } },
  { $skip: page * limit },
  { $limit: limit + 1 },
  { $unset: ['history', ...sources.map(({ channel }) => `_source_${channel}`)] },
]
