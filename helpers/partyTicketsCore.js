import { zonedMidnight } from './partyFinancialSettlements.js'

export const ticketVisitPeriod = (value, timeZone = 'Asia/Krasnoyarsk') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) ticketFailure('Укажите дату посещения')
  ticketDate(value, true)
  const [year, month, day] = value.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return { validFrom: zonedMidnight(year, month, day, timeZone), validTo: zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone) }
}

export const ticketFailure = (message, status = 400, code = 'partycrm_ticketing_invalid') => { throw Object.assign(new Error(message), { status, code }) }
export const ticketId = (value) => { if (!/^[a-f\d]{24}$/i.test(String(value || ''))) ticketFailure('Некорректный идентификатор'); return String(value).toLowerCase() }
export const ticketInteger = (value, min = 0, max = 1000000000000) => { if (value === '' || value === null || typeof value === 'boolean' || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) ticketFailure('Укажите корректное целое число'); return Number(value) }
export const ticketDate = (value, required = false) => {
  if (value === undefined || value === null || value === '') { if (required) ticketFailure('Укажите дату и время'); return null }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value)
  if (!match) ticketFailure('Некорректная дата')
  const [, year, month, day, hour = 0, minute = 0, second = 0] = match.map((part) => part === undefined ? undefined : Number(part))
  const end = new Date(0); end.setUTCFullYear(year, month, 0)
  const date = new Date(value)
  if (typeof value !== 'string' || month < 1 || month > 12 || day < 1 || day > end.getUTCDate() || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(+date)) ticketFailure('Некорректная дата')
  return date
}
export const ticketText = (value, max = 1000) => { if (typeof value !== 'string' || value.trim().length > max) ticketFailure('Проверьте текстовое поле'); return value.trim() }
export const ticketSaleTotals = (sale) => {
  const canceledValueKopecks = sale.canceledValueKopecks || 0
  const activeAmountKopecks = sale.totalAmountKopecks - canceledValueKopecks
  const netPaidAmountKopecks = sale.paidAmountKopecks - sale.refundedAmountKopecks
  return { activeAmountKopecks, netPaidAmountKopecks, allocatableValueKopecks: Math.max(sale.totalAmountKopecks - canceledValueKopecks - (sale.admittedValueKopecks || 0), 0), dueAmountKopecks: Math.max(activeAmountKopecks - netPaidAmountKopecks, 0), refundableAmountKopecks: Math.max(Math.min(sale.paidAmountKopecks - sale.refundedAmountKopecks, canceledValueKopecks - sale.refundedAmountKopecks), 0), availableAdmissionQuantity: Math.max(sale.quantity - sale.refundedQuantity - sale.admittedQuantity, 0) }
}
export const allocateTicketValue = (sale, quantity) => {
  if (!quantity) return 0
  const remainingUnits = sale.quantity - sale.refundedQuantity - sale.admittedQuantity
  const remainingValue = sale.totalAmountKopecks - (sale.canceledValueKopecks || 0) - (sale.admittedValueKopecks || 0)
  if (quantity > remainingUnits || remainingUnits <= 0 || remainingValue < 0) ticketFailure('Остаток билетов изменился', 409)
  return quantity === remainingUnits ? remainingValue : Math.floor(remainingValue * quantity / remainingUnits)
}
export const normalizeTicketProgram = (input, previous = {}) => {
  const data = { ...previous, ...input }
  const title = ticketText(data.title || '', 180)
  if (!title || !['session', 'open'].includes(data.admission) || !['internal', 'external'].includes(data.source || 'internal') || !['active', 'archived'].includes(data.status || 'active')) ticketFailure('Проверьте программу и режим посещения')
  const unitPriceKopecks = ticketInteger(data.unitPriceKopecks ?? 0)
  const minQuantity = ticketInteger(data.groupDiscount?.minQuantity ?? 0, 0, 100000)
  const amountPerTicketKopecks = ticketInteger(data.groupDiscount?.amountPerTicketKopecks ?? 0, 0, unitPriceKopecks)
  if (minQuantity === 1 || !minQuantity && amountPerTicketKopecks) ticketFailure('Для групповой скидки укажите количество от двух билетов')
  const source = data.source || 'internal', externalProvider = data.externalProvider || ''
  if (source === 'external' && !['ticketscloud', 'krasbilet', 'other'].includes(externalProvider)) ticketFailure('Укажите внешнюю билетную систему')
  return { title, admission: data.admission, locationId: data.locationId ? ticketId(data.locationId) : null, source, externalProvider: source === 'external' ? externalProvider : '', externalProgramId: source === 'external' ? ticketText(data.externalProgramId || '', 180) : '', unitPriceKopecks, currency: 'RUB', groupDiscount: { minQuantity, amountPerTicketKopecks }, status: data.status || 'active' }
}
export const calculateTicketSalePrice = ({ program, quantity, unitPriceKopecks, discountKopecks, mayDiscount = false }) => {
  const qty = ticketInteger(quantity, 1, 1000), unit = unitPriceKopecks === undefined ? program.unitPriceKopecks : ticketInteger(unitPriceKopecks)
  const discount = ticketInteger(discountKopecks ?? 0)
  if ((unit !== program.unitPriceKopecks || discount) && !mayDiscount) ticketFailure('Нет права изменять цену или скидку', 403)
  const group = program.groupDiscount?.minQuantity && qty >= program.groupDiscount.minQuantity ? Math.min(program.groupDiscount.amountPerTicketKopecks, unit) * qty : 0
  const total = unit * qty - group - discount
  if (!Number.isSafeInteger(total) || total < 0 || total > 1000000000000) ticketFailure('Скидка превышает стоимость или сумма слишком велика')
  return { quantity: qty, unitPriceKopecks: unit, groupDiscountKopecks: group, discountKopecks: discount, totalAmountKopecks: total }
}
export const normalizeTicketContact = (input = {}) => {
  const name = ticketText(input.name || '', 120), email = ticketText(input.email || '', 160).toLowerCase()
  let phone = ticketText(input.phone || '', 40).replace(/[^\d]/g, '')
  if (phone.length === 10) phone = `7${phone}`
  if (phone.length === 11 && phone.startsWith('8')) phone = `7${phone.slice(1)}`
  if (phone && !/^7\d{10}$/.test(phone) || email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ticketFailure('Проверьте телефон и email')
  return { name, phone, email }
}
export const ticketRefundChange = (sale, input) => {
  const quantity = ticketInteger(input.quantity ?? 0, 0, sale.quantity - sale.refundedQuantity - sale.admittedQuantity)
  const amountKopecks = ticketInteger(input.amountKopecks ?? 0, 0, sale.paidAmountKopecks - sale.refundedAmountKopecks)
  if (!quantity && !amountKopecks) ticketFailure('Укажите билеты или сумму возврата')
  const nextQuantity = sale.refundedQuantity + quantity
  const canceledValueKopecks = (sale.canceledValueKopecks || 0) + allocateTicketValue(sale, quantity)
  if (amountKopecks + sale.refundedAmountKopecks > canceledValueKopecks) ticketFailure('Сумма возврата превышает стоимость отменённых билетов')
  return { quantity, amountKopecks, canceledValueKopecks, refundedQuantity: nextQuantity, refundedAmountKopecks: sale.refundedAmountKopecks + amountKopecks, status: nextQuantity === sale.quantity ? 'canceled' : 'active' }
}
