const open = (task) => ['new', 'in_progress'].includes(task.status)
const dateOf = (value) => value && Number.isFinite(+new Date(value)) ? new Date(value) : null

export const getPartyTaskDayBounds = (now = new Date()) => {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export const matchesPartyTaskFilter = (task, filter = 'open', now = new Date()) => {
  if (filter === 'all') return true
  if (filter === 'open') return open(task)
  const due = dateOf(task.dueAt)
  if (filter === 'overdue') return Boolean(open(task) && due && due < now)
  if (filter === 'undated') return open(task) && !due
  if (filter === 'today') {
    const { start, end } = getPartyTaskDayBounds(now)
    return Boolean(open(task) && due && due >= start && due < end)
  }
  return task.status === filter
}

export const getPartyTaskDueLabel = (task, now = new Date()) => {
  const due = dateOf(task.dueAt)
  if (!due) return 'Без срока'
  const { start, end } = getPartyTaskDayBounds(now)
  const tomorrowEnd = new Date(end)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
  const time = due.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const day = due >= start && due < end ? 'Сегодня' : due >= end && due < tomorrowEnd ? 'Завтра' : due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(due.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  return `${open(task) && due < now ? 'Просрочена · ' : ''}${day}, ${time}`
}

export const getPartyTaskQuickDate = (days, now = new Date()) => {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  date.setHours(10, 0, 0, 0)
  if (days === 0 && date <= now) {
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 0, 0)
    date.setTime(Math.min(+now + 60 * 60 * 1000, +endOfToday))
    date.setSeconds(0, 0)
  }
  return date
}
