const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '')

// A complete pasted number is normalized before any visual formatting.
// Ten national digits are never shortened just because they start with 7 or 8.
export const normalizePhoneNumber = (value) => {
  const source = String(value ?? '').trim()
  if (!source || /[^\d+()\s.\-‐‑‒–—]/u.test(source)) return null
  if (source.includes('+') && !/^\+7[^+]*$/.test(source)) return null
  const digits = digitsOnly(source)
  if (digits.length === 10 && !source.startsWith('+')) return `7${digits}`
  if (digits.length === 11 && /^[78]/.test(digits)) return `7${digits.slice(1)}`
  return null
}

export const getPhoneLocalDigits = (value) => {
  const source = String(value ?? '').trim()
  const digits = digitsOnly(source)
  if (!digits) return ''
  if (/^\+7/.test(source)) return digits.slice(1, 11)
  const complete = normalizePhoneNumber(source)
  if (complete) return complete.slice(1)
  // Existing forms store partial values with the canonical country prefix.
  return (digits.startsWith('7') ? digits.slice(1) : digits).slice(0, 10)
}

export const formatPhoneLocalDigits = (value) => {
  const local = digitsOnly(value).slice(0, 10)
  if (!local) return ''
  let display = `(${local.slice(0, 3)}`
  if (local.length >= 3) display += ')'
  if (local.length > 3) display += ` ${local.slice(3, 6)}`
  if (local.length > 6) display += `-${local.slice(6, 8)}`
  if (local.length > 8) display += `-${local.slice(8, 10)}`
  return display
}

export const phoneLocalDigitsToValue = (digits) =>
  digits ? Number(`7${digitsOnly(digits).slice(0, 10)}`) : null

export const formatPhoneNumber = (value) => {
  const phone = normalizePhoneNumber(value)
  return phone ? `+7 ${formatPhoneLocalDigits(phone.slice(1))}` : ''
}

export const countPhoneDigitsBefore = (display, caret) =>
  digitsOnly(String(display).slice(0, Math.max(0, caret ?? 0))).length

export const phoneCaretAfterDigits = (display, count) => {
  if (count <= 0) return display.startsWith('(') ? 1 : 0
  let remaining = count
  for (let index = 0; index < display.length; index += 1) {
    if (!/\d/.test(display[index])) continue
    remaining -= 1
    if (!remaining) return index + 1
  }
  return display.length
}

// Operate on digit indices, so Backspace/Delete also work next to (), spaces
// and dashes, and selected digits in the middle do not move the caret to the end.
export const editPhoneDigits = ({
  digits = '',
  selectionStart = 0,
  selectionEnd = selectionStart,
  inputType = 'insertText',
  text = '',
}) => {
  const display = formatPhoneLocalDigits(digits)
  let start = countPhoneDigitsBefore(display, selectionStart)
  let end = countPhoneDigitsBefore(display, selectionEnd)
  if (inputType.startsWith('delete')) {
    if (start === end) {
      if (inputType === 'deleteContentBackward') start = Math.max(0, start - 1)
      else end = Math.min(digits.length, end + 1)
    }
    const nextDigits = digits.slice(0, start) + digits.slice(end)
    return {
      digits: nextDigits,
      caret: phoneCaretAfterDigits(formatPhoneLocalDigits(nextDigits), start),
    }
  }
  const available = 10 - (digits.length - (end - start))
  const inserted = digitsOnly(text).slice(0, Math.max(0, available))
  const nextDigits = digits.slice(0, start) + inserted + digits.slice(end)
  return {
    digits: nextDigits,
    caret: phoneCaretAfterDigits(
      formatPhoneLocalDigits(nextDigits),
      start + inserted.length
    ),
  }
}

const separators = '[ \\t\\u00a0\\u202f.\\-‐‑‒–—]*'
const nationalNumber = [
  `(?:\\([1-9]\\d{2}\\)|[1-9]\\d{2})${separators}\\d{3}${separators}\\d{2}${separators}\\d{2}`,
  `\\([1-9]\\d{3}\\)${separators}\\d{2}${separators}\\d{2}${separators}\\d{2}`,
  `\\([1-9]\\d{4}\\)${separators}\\d${separators}\\d{2}${separators}\\d{2}`,
].join('|')
const phonePattern = new RegExp(
  `(?<![\\p{L}\\p{N}_+])(?:(?:\\+7|[78])${separators})?` +
    `(?:${nationalNumber})(?![\\p{L}\\p{N}_])`,
  'gu'
)
const foreignPrefix = new RegExp(`\\+\\d{1,3}${separators}$`)

export const phoneNumbersFromText = (text) => {
  if (typeof text !== 'string') return []
  const phones = new Set()
  for (const match of text.matchAll(phonePattern)) {
    if (
      foreignPrefix.test(text.slice(Math.max(0, match.index - 16), match.index))
    )
      continue
    const phone = normalizePhoneNumber(match[0])
    if (phone) phones.add(phone)
  }
  return [...phones]
}
