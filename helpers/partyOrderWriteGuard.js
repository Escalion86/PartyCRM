// Match the state whose readiness/commercial conditions were actually checked.
// All order models use timestamps; missing values keep legacy orders editable.
export const getPartyOrderWriteGuard = (order) => ({
  status: order.status,
  // Group changes touch this revision even for legacy orders without updatedAt.
  $and: [Number(order.sharedLocationRevision || 0) === 0
    ? { $or: [{ sharedLocationRevision: 0 }, { sharedLocationRevision: { $exists: false } }] }
    : { sharedLocationRevision: Number(order.sharedLocationRevision) }],
  ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
  ...(Number(order.commercialRevision || 0) === 0
    ? { $or: [{ commercialRevision: 0 }, { commercialRevision: { $exists: false } }] }
    : { commercialRevision: Number(order.commercialRevision) }),
})
