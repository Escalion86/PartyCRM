export function formatMoney(amount) {
  if (amount === null || amount === undefined) return '0 ₽'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + ' ₽'
}
