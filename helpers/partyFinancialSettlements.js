export const financialId = (value) => String(value?._id ?? value ?? '')
export const isFinancialId = (value) =>
  /^[a-f\d]{24}$/i.test(financialId(value))
export const financialError = (message, status = 400) =>
  Object.assign(new Error(message), { status })

export const normalizeMoney = (value, name, { signed = false } = {}) => {
  const number = Number(value ?? 0)
  if (
    !Number.isSafeInteger(number) ||
    (!signed && number < 0) ||
    Math.abs(number) > 100000000000
  )
    throw financialError(
      `Проверьте сумму «${name}»: используйте целое число копеек`
    )
  return number
}

export const normalizeSettlementAmounts = (body) => ({
  accrualKopecks: normalizeMoney(body.accrualKopecks, 'Начислено'),
  deductionKopecks: normalizeMoney(body.deductionKopecks, 'Удержания'),
  transportKopecks: normalizeMoney(body.transportKopecks, 'Транспортные'),
  otherExpenseKopecks: normalizeMoney(
    body.otherExpenseKopecks,
    'Прочие расходы'
  ),
  comment: String(body.comment || '')
    .trim()
    .slice(0, 2000),
})

export const calculateSettlementTotals = (settlement, operations = []) => {
  const receivedOnSite = operations
    .filter(
      (item) => item.type === 'received_on_site' && item.status !== 'reversed'
    )
    .reduce(
      (sum, item) => sum + item.amountKopecks,
      Number(settlement.importedReceivedOnSiteKopecks || 0)
    )
  const paid = operations
    .filter((item) => item.type === 'payment' && item.status !== 'reversed')
    .reduce((sum, item) => sum + item.amountKopecks, 0)
  const correction = operations
    .filter((item) => item.type === 'correction' && item.status !== 'reversed')
    .reduce((sum, item) => sum + item.amountKopecks, 0)
  const earned =
    Number(settlement.accrualKopecks || 0) +
    Number(settlement.transportKopecks || 0) +
    Number(settlement.otherExpenseKopecks || 0) +
    correction
  const payable =
    earned - Number(settlement.deductionKopecks || 0) - receivedOnSite
  return {
    earned,
    receivedOnSite,
    paid,
    correction,
    payable,
    balance: payable - paid,
  }
}

const validZone = (candidate) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format()
    return candidate
  } catch {
    return 'Asia/Krasnoyarsk'
  }
}
const parts = (date, timeZone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((item) => item.type !== 'literal')
      .map((item) => [item.type, Number(item.value)])
  )
export const zonedMidnight = (year, month, day, zone) => {
  const timeZone = validZone(zone)
  let result = new Date(Date.UTC(year, month - 1, day))
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = parts(result, timeZone)
    const wanted = Date.UTC(year, month - 1, day)
    const observed = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    )
    result = new Date(+result + wanted - observed)
  }
  return result
}
const nextMonth = (year, month) =>
  month === 12 ? [year + 1, 1] : [year, month + 1]
export const getFinancialPeriodForEvent = (
  eventDate,
  zone = 'Asia/Krasnoyarsk'
) => {
  const date = new Date(eventDate)
  if (!Number.isFinite(+date))
    throw financialError('Некорректная дата мероприятия')
  const timeZone = validZone(zone)
  const local = parts(date, timeZone)
  const firstHalf = local.day <= 15
  const [nextYear, nextMonthNumber] = nextMonth(local.year, local.month)
  const workStart = zonedMidnight(
    local.year,
    local.month,
    firstHalf ? 1 : 16,
    timeZone
  )
  const workEndExclusive = firstHalf
    ? zonedMidnight(local.year, local.month, 16, timeZone)
    : zonedMidnight(nextYear, nextMonthNumber, 1, timeZone)
  const reconcileYear = firstHalf ? local.year : nextYear
  const reconcileMonth = firstHalf ? local.month : nextMonthNumber
  return {
    periodKey: `${local.year}-${String(local.month).padStart(2, '0')}-${firstHalf ? 'H1' : 'H2'}`,
    timeZone,
    workStart,
    workEndExclusive,
    reconciliationStart: zonedMidnight(
      reconcileYear,
      reconcileMonth,
      firstHalf ? 16 : 2,
      timeZone
    ),
    reconciliationEndExclusive: zonedMidnight(
      reconcileYear,
      reconcileMonth,
      firstHalf ? 21 : 6,
      timeZone
    ),
    paymentStart: zonedMidnight(
      reconcileYear,
      reconcileMonth,
      firstHalf ? 24 : 12,
      timeZone
    ),
    paymentEndExclusive: zonedMidnight(
      reconcileYear,
      reconcileMonth,
      firstHalf ? 28 : 16,
      timeZone
    ),
  }
}

export const normalizeFinancialOperation = (body) => {
  const type = String(body.type || '')
  const idempotencyKey = String(body.idempotencyKey || '')
  if (!['received_on_site', 'payment', 'correction'].includes(type))
    throw financialError('Некорректный тип денежной операции')
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey))
    throw financialError('Некорректный идентификатор операции')
  const amount = normalizeMoney(body.amountKopecks, 'Операция', {
    signed: type === 'correction',
  })
  if (amount === 0) throw financialError('Сумма операции не может быть нулевой')
  const comment = String(body.comment || '')
    .trim()
    .slice(0, 1000)
  if (type === 'correction' && !comment)
    throw financialError('Укажите причину корректировки')
  return { type, amountKopecks: amount, comment, idempotencyKey }
}
