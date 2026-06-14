const MAX_SYNC_ITERATIONS = 100

export const getNextCalendarDraftState = ({
  currentDraft,
  dirty,
  syncDraft,
  statusSettings,
}) => {
  if (dirty && !syncDraft) return { draft: currentDraft, dirty: true }
  return { draft: statusSettings, dirty: false }
}

export const getNextSyncCursor = ({
  currentCursor,
  nextCursor,
  iteration,
}) => {
  if (iteration > MAX_SYNC_ITERATIONS) {
    throw new Error('Синхронизация остановлена: превышен безопасный лимит пакетов')
  }
  const current = String(currentCursor || '')
  const next = String(nextCursor || '')
  if (!next) throw new Error('Сервер не вернул курсор продолжения')
  if (next === current) {
    throw new Error('Синхронизация остановлена: позиция не продвинулась')
  }
  return next
}

export const isGoogleCalendarLocked = ({ access, status }) =>
  access?.allowCalendarSync !== true || status?.allowCalendarSync !== true

export { MAX_SYNC_ITERATIONS }
