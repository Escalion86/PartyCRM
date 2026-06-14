export const INTEGRATION_INDICATOR_STATE = Object.freeze({
  connected: 'connected',
  disconnected: 'disconnected',
  warning: 'warning',
  loading: 'loading',
})

const hasValue = (value) =>
  typeof value === 'string' && value.trim().length > 0

export const getCompanyIntegrationIndicatorState = ({
  type,
  enabled = false,
  status = '',
  apiKey = '',
  apiKeys = [],
  connected = false,
  calendarId = '',
  lastError = '',
  reconnectRequired = false,
  locked = false,
  loading = false,
}) => {
  if (locked) return INTEGRATION_INDICATOR_STATE.warning
  if (loading) return INTEGRATION_INDICATOR_STATE.loading

  if (type === 'publicLead') {
    if (!enabled) return INTEGRATION_INDICATOR_STATE.disconnected

    const hasActiveKey = apiKeys.some(
      (item) => item?.enabled !== false && hasValue(item?.key)
    )

    return hasActiveKey
      ? INTEGRATION_INDICATOR_STATE.connected
      : INTEGRATION_INDICATOR_STATE.warning
  }

  if (type === 'googleCalendar') {
    if (!connected) return INTEGRATION_INDICATOR_STATE.disconnected
    if (
      !enabled ||
      !hasValue(calendarId) ||
      hasValue(lastError) ||
      reconnectRequired
    ) {
      return INTEGRATION_INDICATOR_STATE.warning
    }
    return INTEGRATION_INDICATOR_STATE.connected
  }

  if (type === 'avito' || type === 'vk') {
    if (status === 'connected') return INTEGRATION_INDICATOR_STATE.connected
    return enabled
      ? INTEGRATION_INDICATOR_STATE.warning
      : INTEGRATION_INDICATOR_STATE.disconnected
  }

  if (type === 'novofon') {
    if (!enabled) return INTEGRATION_INDICATOR_STATE.disconnected
    return hasValue(apiKey)
      ? INTEGRATION_INDICATOR_STATE.connected
      : INTEGRATION_INDICATOR_STATE.warning
  }

  if (type === 'ai') {
    return hasValue(apiKey)
      ? INTEGRATION_INDICATOR_STATE.connected
      : INTEGRATION_INDICATOR_STATE.disconnected
  }

  return INTEGRATION_INDICATOR_STATE.disconnected
}
