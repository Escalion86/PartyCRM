import SiteSettings from '@models/SiteSettings'

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

export const getTenantAiSettings = async (tenantId) => {
  if (!tenantId) return {}
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const custom = siteSettings?.custom ?? {}
  const aitunnelKey = String(getCustomValue(custom, 'aitunnelKey') || '').trim()
  const defaultProvider = aitunnelKey ? 'aitunnel' : ''
  return {
    aitunnelKey,
    aiAnalysisProvider: String(
      getCustomValue(custom, 'aiAnalysisProvider') || defaultProvider
    ).trim(),
    aiAnalysisModel: String(getCustomValue(custom, 'aiAnalysisModel') || '').trim(),
    aiTranscriptionProvider: String(
      getCustomValue(custom, 'aiTranscriptionProvider') || defaultProvider
    ).trim(),
    aiTranscriptionModel: String(
      getCustomValue(custom, 'aiTranscriptionModel') || ''
    ).trim(),
    eventTypes: normalizeStringList(getCustomValue(custom, 'eventTypes')),
  }
}
