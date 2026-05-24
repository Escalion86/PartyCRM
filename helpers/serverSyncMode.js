export const SERVER_SYNC_DISABLED_KEY = 'artistcrm:server-sync-disabled'

const parseStoredBoolean = (value) => {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

export const readServerSyncDisabledFromStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SERVER_SYNC_DISABLED_KEY)
    return parseStoredBoolean(raw)
  } catch (error) {
    return null
  }
}

export const writeServerSyncDisabledToStorage = (value) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SERVER_SYNC_DISABLED_KEY, value ? '1' : '0')
  } catch (error) {
    // no-op
  }
}

export const resolveServerSyncDisabled = (siteSettings) => {
  const fromStorage = readServerSyncDisabledFromStorage()
  if (typeof fromStorage === 'boolean') return fromStorage
  return Boolean(siteSettings?.custom?.disableServerSync)
}

