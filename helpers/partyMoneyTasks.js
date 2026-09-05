import {
  financialError,
  financialId,
  isFinancialId,
  normalizeMoney,
} from './partyFinancialSettlements.js'

export const normalizeMoneyTask = (body) => {
  const type = String(body.type || '')
  const orderId = financialId(body.orderId)
  const staffId = financialId(body.staffId)
  const responsibleStaffId = financialId(body.responsibleStaffId)
  const settlementId = financialId(body.settlementId)
  const dueAt = new Date(body.dueAt)
  const paymentMethod = String(body.paymentMethod || '')
  const recipientType = String(body.recipientType || '')
  const recipientLabel = String(body.recipientLabel || '')
    .trim()
    .slice(0, 160)
  const idempotencyKey = String(body.idempotencyKey || '')
  if (!['receive_from_client', 'transfer_to_company'].includes(type))
    throw financialError('Некорректный тип денежного поручения')
  if (
    ![orderId, staffId, responsibleStaffId].every(isFinancialId) ||
    (settlementId && !isFinancialId(settlementId))
  )
    throw financialError('Проверьте заказ и сотрудников поручения')
  if (staffId !== responsibleStaffId)
    throw financialError(
      'Ответственный и держатель денег должны быть одним сотрудником'
    )
  if (!Number.isFinite(+dueAt))
    throw financialError('Укажите срок денежного поручения')
  if (!['cash', 'transfer', 'account', 'other'].includes(paymentMethod))
    throw financialError('Укажите способ передачи денег')
  const expectedRecipient =
    type === 'receive_from_client' ? 'client' : 'company'
  if (recipientType !== expectedRecipient || !recipientLabel)
    throw financialError('Укажите получателя денег')
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey))
    throw financialError('Некорректный идентификатор поручения')
  const amountKopecks = normalizeMoney(body.amountKopecks, 'Сумма поручения')
  if (!amountKopecks)
    throw financialError('Сумма поручения должна быть больше нуля')
  return {
    type,
    orderId,
    staffId,
    responsibleStaffId,
    settlementId: settlementId || null,
    amountKopecks,
    dueAt,
    paymentMethod,
    recipientType,
    recipientLabel,
    idempotencyKey,
    comment: String(body.comment || '')
      .trim()
      .slice(0, 1000),
  }
}

export const normalizeMoneyTaskSubmission = (body) => {
  const submittedAmountKopecks = normalizeMoney(
    body.actualAmountKopecks,
    'Фактическая сумма'
  )
  if (!submittedAmountKopecks)
    throw financialError('Фактическая сумма должна быть больше нуля')
  return {
    submittedAmountKopecks,
    submissionComment: String(body.comment || '')
      .trim()
      .slice(0, 1000),
  }
}

export const calculateCustodyBalance = (
  operations,
  { orderId, staffId, retainedKopecks = 0 }
) =>
  operations
    .filter(
      (item) =>
        financialId(item.orderId) === financialId(orderId) &&
        financialId(item.staffId) === financialId(staffId)
    )
    .reduce(
      (sum, item) => {
        if (item.type === 'custody_received_from_client')
          return sum + item.amountKopecks
        if (item.type === 'custody_transferred_to_company')
          return sum - item.amountKopecks
        if (item.type === 'received_on_site') return sum - item.amountKopecks
        return sum
      },
      -Number(retainedKopecks || 0)
    )

export const resolveMoneyTaskReview = ({ task, action, revision, comment }) => {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision !== task.revision
  )
    throw financialError('Поручение уже изменено; обновите данные', 409)
  if (action === 'request_revision' && task.status === 'submitted') {
    const reviewComment = String(comment || '')
      .trim()
      .slice(0, 1000)
    if (!reviewComment)
      throw financialError('Укажите причину возврата на доработку')
    return {
      expectedStatus: 'submitted',
      patch: { status: 'pending', reviewComment },
    }
  }
  if (action === 'cancel' && ['pending', 'submitted'].includes(task.status))
    return { expectedStatus: task.status, patch: { status: 'canceled' } }
  if (action === 'approve_completion' && task.status === 'submitted')
    return { expectedStatus: 'submitted', patch: null }
  throw financialError('Недопустимый переход статуса поручения', 409)
}
