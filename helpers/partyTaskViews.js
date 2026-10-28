import { getPartyTaskDayBounds } from './partyTaskPresentation.js'

export const PARTY_TASK_BOARD_STATUSES = ['new', 'in_progress', 'done']

export const canMovePartyTask = (task, status) =>
  Boolean(
    ((task?.canComplete && ['new', 'in_progress'].includes(task.status)) ||
      (task?.canReopen &&
        ['done', 'canceled'].includes(task.status) &&
        ['new', 'in_progress'].includes(status))) &&
    PARTY_TASK_BOARD_STATUSES.includes(status) &&
    status !== task.status
  )

export const partyTaskViewPreferenceKey = (companyId, staffId) =>
  companyId && staffId
    ? `partycrm:v1:tasks-view:${encodeURIComponent(companyId)}:${encodeURIComponent(staffId)}`
    : null

export const readPartyTaskView = (
  storage,
  companyId,
  staffId,
  narrow = false
) => {
  try {
    const key = partyTaskViewPreferenceKey(companyId, staffId)
    const value = key && storage?.getItem(key)
    if (value === 'board' || value === 'list') return value
  } catch {
    // Private browsing or an exhausted storage quota must not block tasks.
  }
  return narrow ? 'list' : 'board'
}

export const savePartyTaskView = (storage, companyId, staffId, view) => {
  if (!['board', 'list'].includes(view)) return
  try {
    const key = partyTaskViewPreferenceKey(companyId, staffId)
    if (key) storage?.setItem(key, view)
  } catch {
    // The selected view still works when persistence is unavailable.
  }
}

export const buildPartyTasksQuery = ({
  orderId,
  filter = 'open',
  search = '',
  scope = 'all',
  status,
  cursor,
  now = new Date(),
}) => {
  const query = new URLSearchParams({ filter, scope })
  if (orderId) query.set('orderId', orderId)
  if (search.trim()) query.set('search', search.trim())
  if (status) query.set('status', status)
  if (cursor) query.set('cursor', cursor)
  if (filter === 'today') {
    const { start, end } = getPartyTaskDayBounds(now)
    query.set('dayFrom', start.toISOString())
    query.set('dayTo', end.toISOString())
  }
  if (filter === 'overdue') query.set('now', now.toISOString())
  return query
}

export const mergePartyTaskRows = (previous = [], incoming = []) => {
  const byId = new Map(previous.map((task) => [String(task._id), task]))
  incoming.forEach((task) => byId.set(String(task._id), task))
  return [...byId.values()]
}

// Board columns have independent cursors. In particular, an empty page may
// still have a cursor when the server is skipping inaccessible candidates.
export const mergePartyTaskBoardPages = (previous, pages, append = false) => {
  const columns = append ? { ...previous.columns } : {}
  const staff = new Map(
    (append ? previous.staff : []).map((row) => [String(row._id), row])
  )
  const roles = new Map(
    (append ? previous.roles : []).map((row) => [String(row._id), row])
  )
  let metadata = previous
  pages.forEach(({ status, data }) => {
    metadata = { ...metadata, ...data }
    data.staff.forEach((row) => staff.set(String(row._id), row))
    data.roles.forEach((row) => roles.set(String(row._id), row))
    columns[status] = {
      tasks: mergePartyTaskRows(
        append ? columns[status]?.tasks : [],
        data.tasks
      ),
      nextCursor: data.nextCursor || null,
    }
  })
  // A task can move while independent column requests are in flight. Keep its
  // newest revision once, in the status returned by the canonical task DTO.
  const newest = new Map()
  PARTY_TASK_BOARD_STATUSES.forEach((status) => {
    ;(columns[status]?.tasks || []).forEach((task) => {
      const current = newest.get(String(task._id))
      if (
        !current ||
        Number(task.revision || 0) >= Number(current.revision || 0)
      )
        newest.set(String(task._id), task)
    })
  })
  PARTY_TASK_BOARD_STATUSES.forEach((status) => {
    columns[status] = {
      ...columns[status],
      tasks: [...newest.values()].filter((task) => task.status === status),
    }
  })
  return {
    ...metadata,
    columns,
    tasks: PARTY_TASK_BOARD_STATUSES.flatMap(
      (status) => columns[status]?.tasks || []
    ),
    staff: [...staff.values()],
    roles: [...roles.values()],
    nextCursor: null,
  }
}
