export const normalizeAuthPhoneForCall = (value) => {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  if (rawValue.startsWith('+')) return rawValue

  const digits = rawValue.replace(/[^\d]/g, '')
  if (!digits) return ''

  return `+${digits}`
}
