import { financialError } from './partyFinancialSettlements.js'

const id = (value) => String(value ?? '')
const amountFields = [
  'accrualKopecks', 'deductionKopecks', 'transportKopecks',
  'otherExpenseKopecks', 'importedReceivedOnSiteKopecks',
]

export const assertPayrollSnapshotMembership = (lines = [], settlements = []) => {
  const ids = new Set(lines.map((line) => id(line.settlementId)))
  if (
    ids.size !== lines.length || ids.size !== settlements.length ||
    settlements.some((item) => !ids.has(id(item._id)))
  ) {
    throw financialError(
      'Состав расчётов периода изменился. Пересоберите черновик ведомости; для уже утверждённой ведомости требуется сверка состава.',
      409
    )
  }
}

export const assertPayrollSnapshotCurrent = (lines = [], settlements = []) => {
  assertPayrollSnapshotMembership(lines, settlements)
  const byId = new Map(settlements.map((item) => [id(item._id), item]))
  for (const line of lines) {
    const current = byId.get(id(line.settlementId))
    const changed =
      ['orderId', 'staffId'].some((field) => id(line[field]) !== id(current[field])) ||
      +new Date(line.eventDate) !== +new Date(current.eventDate) ||
      amountFields.some((field) => Number(line[field] || 0) !== Number(current[field] || 0)) ||
      [...new Set([...Object.keys(line.totals || {}), ...Object.keys(current.totals || {})])]
        .some((field) => Number(line.totals?.[field] || 0) !== Number(current.totals?.[field] || 0))
    if (changed) {
      throw financialError('Суммы расчётов изменились. Пересоберите ведомость перед утверждением.', 409)
    }
  }
}
