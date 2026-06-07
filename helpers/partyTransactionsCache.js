export const upsertPartyTransaction = (items = [], nextItem) => {
  if (!nextItem?._id) return Array.isArray(items) ? items : []
  const list = Array.isArray(items) ? items : []
  const exists = list.some((item) => String(item?._id) === String(nextItem._id))
  if (!exists) return [nextItem, ...list]
  return list.map((item) =>
    String(item?._id) === String(nextItem._id) ? nextItem : item
  )
}

export const removePartyTransaction = (items = [], itemId) => {
  const list = Array.isArray(items) ? items : []
  return list.filter((item) => String(item?._id) !== String(itemId))
}
