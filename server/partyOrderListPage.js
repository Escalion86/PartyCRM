import { PARTY_ORDER_LIST_PAGE_SIZE, PARTY_ORDER_LIST_SCAN_LIMIT, PARTY_ORDER_LIST_BATCH_SIZE } from '../helpers/partyOrderListQuery.js'
import { withPartyOrderTaskSummaries } from './partyOrderTaskSummaries'

// A read-only scan uses the same task visibility and legacy-source deduplication
// as each order's badge. A scan budget is a continuation, never a false end.
export const loadPartyOrderListPage = async ({ context, list, accessFilter, findOrders, summarizeTasks = withPartyOrderTaskSummaries }) => {
  const taskFilter = list.quick === 'tasks'
  const matches = []
  let cursor = list.cursor, scanned = 0, hasMore = false
  while (scanned < PARTY_ORDER_LIST_SCAN_LIMIT) {
    const batchSize = taskFilter ? Math.min(PARTY_ORDER_LIST_BATCH_SIZE, PARTY_ORDER_LIST_SCAN_LIMIT - scanned) : PARTY_ORDER_LIST_PAGE_SIZE
    const rows = await findOrders({ $and: [accessFilter, ...list.clauses, ...(cursor ? [{ _id: { $lt: cursor } }] : [])] }, { _id: -1 }, batchSize + 1)
    const candidates = rows.slice(0, batchSize)
    scanned += candidates.length
    hasMore = rows.length > batchSize
    const visible = taskFilter ? await summarizeTasks({ context, orders: candidates }) : candidates
    matches.push(...visible.filter((order) => !taskFilter || Number(order.taskSummary?.openCount || 0) > 0))
    if (!taskFilter || matches.length > PARTY_ORDER_LIST_PAGE_SIZE) {
      const orders = matches.slice(0, PARTY_ORDER_LIST_PAGE_SIZE)
      hasMore = hasMore || matches.length > PARTY_ORDER_LIST_PAGE_SIZE
      return { orders, meta: { nextCursor: hasMore ? String(orders.at(-1)._id) : null, hasMore, returned: orders.length, scanned, total: null } }
    }
    if (!hasMore) break
    cursor = String(candidates.at(-1)._id)
  }
  return { orders: matches, meta: { nextCursor: hasMore ? cursor : null, hasMore, returned: matches.length, scanned, total: null } }
}
