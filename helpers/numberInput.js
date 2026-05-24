export const normalizeNumberInputString = (rawValue) => {
  const source = String(rawValue ?? '')
  if (!source) return ''

  const digits = source.replace(/\D/g, '')
  if (!digits) return ''

  return digits.replace(/^0+(?=\d)/, '')
}

export const toNormalizedNumber = (rawValue, options = {}) => {
  const { fallback = 0, min, max } = options
  const normalized = normalizeNumberInputString(rawValue)

  if (!normalized) return fallback

  let parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return fallback

  if (typeof min === 'number' && parsed < min) parsed = min
  if (typeof max === 'number' && parsed > max) parsed = max

  return parsed
}
