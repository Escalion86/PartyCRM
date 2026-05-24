export const SERVER_SYNC_QUEUE_KEY = 'artistcrm:server-sync-queue'
export const SERVER_SYNC_QUEUE_CHANGED_EVENT = 'artistcrm:server-sync-queue-changed'
export const SERVER_SYNC_FLUSH_NOW_EVENT = 'artistcrm:server-sync-flush-now'
const MAX_QUEUE_SIZE = 500

const safeParse = (value) => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

const emitQueueChanged = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SERVER_SYNC_QUEUE_CHANGED_EVENT))
}

export const readServerSyncQueue = () => {
  if (typeof window === 'undefined') return []
  try {
    return safeParse(window.localStorage.getItem(SERVER_SYNC_QUEUE_KEY))
  } catch (error) {
    return []
  }
}

export const getServerSyncQueueCount = () => readServerSyncQueue().length

export const appendServerSyncQueueItem = (item) => {
  if (typeof window === 'undefined' || !item) return
  const queue = readServerSyncQueue()
  const nextQueue = [...queue, item].slice(-MAX_QUEUE_SIZE)
  try {
    window.localStorage.setItem(SERVER_SYNC_QUEUE_KEY, JSON.stringify(nextQueue))
    emitQueueChanged()
  } catch (error) {
    // no-op
  }
}

export const clearServerSyncQueue = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SERVER_SYNC_QUEUE_KEY)
    emitQueueChanged()
  } catch (error) {
    // no-op
  }
}

const saveServerSyncQueue = (queue) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SERVER_SYNC_QUEUE_KEY, JSON.stringify(queue))
    emitQueueChanged()
  } catch (error) {
    // no-op
  }
}

export const shiftServerSyncQueue = (count = 1) => {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(count) || count <= 0) return
  const queue = readServerSyncQueue()
  if (queue.length === 0) return
  saveServerSyncQueue(queue.slice(count))
}

export const replaceServerSyncQueue = (queue = []) => {
  if (!Array.isArray(queue)) return
  saveServerSyncQueue(queue.slice(-MAX_QUEUE_SIZE))
}
