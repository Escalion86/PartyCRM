export const ticketControl =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-500'
export const ticketButton =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50'
export const ticketPrimary =
  'min-h-11 cursor-pointer rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
export const ticketCard =
  'min-w-0 rounded-2xl border border-sky-100 bg-white p-3 sm:p-5'
export const ticketMoney = (value) =>
  Number.isSafeInteger(value)
    ? (value / 100).toLocaleString('ru-RU', {
        style: 'currency',
        currency: 'RUB',
      })
    : '—'
export const ticketRubles = (value) =>
  Number.isSafeInteger(value) ? (value / 100).toFixed(2) : ''
export const ticketKopecks = (value) => {
  const text = String(value ?? '')
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null
  const [rubles, cents = ''] = text.split('.')
  const amount = Number(rubles) * 100 + Number(cents.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : null
}
export const ticketDate = (value) =>
  value && Number.isFinite(+new Date(value))
    ? new Date(value).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Без фиксированного времени'
export const ticketLocalDate = (value) => {
  if (!value || !Number.isFinite(+new Date(value))) return ''
  const date = new Date(value)
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
export const ticketId = (value) => String(value?._id || value || '')
