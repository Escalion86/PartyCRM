import {
  isReportAuthor,
  isReportManager,
  reportFailure,
} from './partyReportCore.js'

export const PARTY_RECONCILIATION_VALUE_TYPES = Object.freeze([
  'money',
  'date',
  'payment_method',
  'text',
])
const PAYMENT_METHODS = new Set(['transfer', 'account', 'cash', 'barter'])
const MAX_MONEY_MINOR = 99_999_999_999_999

export const getReportReconciliationFields = (report) =>
  (report.templateSnapshot?.fields || [])
    .filter(
      (field) =>
        field.section === 'finance' &&
        PARTY_RECONCILIATION_VALUE_TYPES.includes(
          field.reconciliationValueType
        ) &&
        /^[a-z][a-z0-9_]{0,63}$/.test(field.reconciliationKey || '')
    )
    .map((field) => ({
      fieldId: field.id,
      label: field.label,
      key: field.reconciliationKey,
      valueType: field.reconciliationValueType,
      required: field.reconciliationRequired === true,
      reviewerStaffId: field.reviewerStaffId || null,
    }))

export const canAccessReportReconciliation = ({
  context,
  report,
  order,
  fields = getReportReconciliationFields(report),
}) => {
  if (context?.role === 'location_owner') return false
  if (isReportManager(context)) return true
  const assignedAuthor =
    isReportAuthor(context, report) &&
    (order.assignedStaff || []).some(
      (item) => String(item.staffId) === String(context.staff._id)
    )
  return (
    assignedAuthor ||
    fields.some(
      (field) =>
        String(field.reviewerStaffId || '') ===
        String(context?.staff?._id || '')
    )
  )
}

export const normalizeReconciliationValue = (valueType, raw) => {
  const empty = raw === null || raw === undefined || raw === ''
  if (empty)
    return {
      hasValue: false,
      moneyMinor: null,
      dateValue: null,
      choiceValue: '',
      textValue: '',
    }
  if (valueType === 'money') {
    if (
      !['string', 'number'].includes(typeof raw) ||
      (typeof raw === 'number' && !Number.isFinite(raw))
    )
      reportFailure('Сумма должна быть числом')
    const source = String(raw).trim().replace(',', '.')
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(source))
      reportFailure(
        'Укажите неотрицательную сумму, не более двух знаков после запятой'
      )
    const [rubles, fraction = ''] = source.split('.')
    const moneyMinor = Number(rubles) * 100 + Number(fraction.padEnd(2, '0'))
    if (!Number.isSafeInteger(moneyMinor) || moneyMinor > MAX_MONEY_MINOR)
      reportFailure('Сумма слишком велика')
    return {
      hasValue: true,
      moneyMinor,
      dateValue: null,
      choiceValue: '',
      textValue: '',
    }
  }
  if (valueType === 'date') {
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
      reportFailure('Дата должна быть в формате ГГГГ-ММ-ДД')
    const dateValue = new Date(`${raw}T00:00:00.000Z`)
    if (
      !Number.isFinite(dateValue.getTime()) ||
      dateValue.toISOString().slice(0, 10) !== raw
    )
      reportFailure('Укажите существующую дату')
    return {
      hasValue: true,
      moneyMinor: null,
      dateValue,
      choiceValue: '',
      textValue: '',
    }
  }
  if (valueType === 'payment_method') {
    if (typeof raw !== 'string' || !PAYMENT_METHODS.has(raw))
      reportFailure('Некорректный способ оплаты')
    return {
      hasValue: true,
      moneyMinor: null,
      dateValue: null,
      choiceValue: raw,
      textValue: '',
    }
  }
  if (valueType === 'text') {
    if (typeof raw !== 'string' || raw.length > 500)
      reportFailure('Текстовое значение должно содержать не более 500 символов')
    const textValue = raw.trim()
    return {
      hasValue: Boolean(textValue),
      moneyMinor: null,
      dateValue: null,
      choiceValue: '',
      textValue,
    }
  }
  reportFailure('Некорректный тип финансового значения')
}

const comparableValue = (value) =>
  JSON.stringify({
    hasValue: Boolean(value.hasValue),
    moneyMinor: value.moneyMinor ?? null,
    dateValue: value.dateValue ? new Date(value.dateValue).toISOString() : null,
    choiceValue: value.choiceValue || '',
    textValue: value.textValue || '',
  })

export const reconciliationStatusFromValues = (values) => {
  if (values.some((value) => value.status === 'revision_requested'))
    return 'revision_requested'
  if (values.some((value) => value.status === 'draft')) return 'draft'
  if (values.some((value) => value.status === 'submitted')) return 'submitted'
  return 'accepted'
}

export const updateReportReconciliation = ({
  reconciliation,
  context,
  action,
  values = {},
  fieldId,
  decision,
  comment = '',
  eventDate,
  reportStage,
  now = new Date(),
}) => {
  const next = reconciliation.values.map((value) => ({ ...value }))
  if (action === 'save' || action === 'submit') {
    if (String(context?.staff?._id || '') !== String(reconciliation.staffId))
      reportFailure('Изменять сверку может только автор отчёта', 403)
    if (!values || typeof values !== 'object' || Array.isArray(values))
      reportFailure('Некорректные значения сверки')
    for (const [key, raw] of Object.entries(values)) {
      const field = reconciliation.fields.find((item) => item.fieldId === key)
      const value = next.find((item) => item.fieldId === key)
      if (!field || !value) reportFailure('Поле финансовой сверки не найдено')
      const normalized = normalizeReconciliationValue(field.valueType, raw)
      const locked =
        ['accepted', 'submitted'].includes(value.status) ||
        (value.status === 'not_required' && reconciliation.submittedAt)
      if (locked && comparableValue(value) !== comparableValue(normalized))
        reportFailure(
          'Отправленное или принятое значение можно менять только после возврата на доработку',
          409
        )
      if (locked) continue
      Object.assign(value, normalized, {
        status:
          normalized.hasValue || field.required
            ? value.status === 'revision_requested'
              ? 'revision_requested'
              : 'draft'
            : 'not_required',
      })
    }
    if (action === 'submit') {
      if (
        reportStage === 'after' &&
        (!eventDate ||
          !Number.isFinite(new Date(eventDate).getTime()) ||
          new Date(eventDate) > now)
      )
        reportFailure(
          'Финансовую сверку итогового отчёта можно отправить после начала мероприятия'
        )
      for (const field of reconciliation.fields) {
        const value = next.find((item) => item.fieldId === field.fieldId)
        if (field.required && !value?.hasValue)
          reportFailure(`Заполните финансовое значение «${field.label}»`)
      }
      for (const value of next) {
        if (value.status === 'accepted' || value.status === 'not_required')
          continue
        Object.assign(value, {
          status: 'submitted',
          reviewComment: '',
          reviewedByStaffId: '',
          reviewedAt: null,
        })
      }
    }
  } else if (action === 'review') {
    const field = reconciliation.fields.find((item) => item.fieldId === fieldId)
    const value = next.find((item) => item.fieldId === fieldId)
    if (
      !field ||
      !value ||
      (!isReportManager(context) &&
        String(field.reviewerStaffId || '') !==
          String(context?.staff?._id || ''))
    )
      reportFailure('Нет доступа к проверке финансового значения', 403)
    if (!['accepted', 'revision_requested'].includes(decision))
      reportFailure('Некорректное решение')
    if (
      !['submitted', 'accepted'].includes(value.status) ||
      (value.status === 'accepted' && decision !== 'revision_requested')
    )
      reportFailure('Значение ещё не отправлено или уже проверено', 409)
    if (typeof comment !== 'string' || comment.length > 2000)
      reportFailure('Комментарий слишком длинный')
    if (decision === 'revision_requested' && !comment.trim())
      reportFailure('Укажите причину возврата на доработку')
    Object.assign(value, {
      status: decision,
      reviewComment: comment.trim(),
      reviewedByStaffId: context.staff._id,
      reviewedAt: now,
    })
  } else reportFailure('Неизвестное действие сверки')
  return next
}

const serializeValue = (value) => {
  let result = null
  if (value.hasValue && value.valueType === 'money')
    result = `${Math.floor(value.moneyMinor / 100)}.${String(value.moneyMinor % 100).padStart(2, '0')}`
  if (value.hasValue && value.valueType === 'date')
    result = new Date(value.dateValue).toISOString().slice(0, 10)
  if (value.hasValue && value.valueType === 'payment_method')
    result = value.choiceValue
  if (value.hasValue && value.valueType === 'text') result = value.textValue
  return {
    fieldId: value.fieldId,
    key: value.key,
    valueType: value.valueType,
    value: result,
    hasValue: Boolean(value.hasValue),
    status: value.status,
    reviewComment: value.reviewComment || '',
    reviewedAt: value.reviewedAt || null,
  }
}

export const serializeReportReconciliation = ({
  reconciliation,
  report,
  order,
  context,
}) => {
  const assigned = (order.assignedStaff || []).some(
    (item) => String(item.staffId) === String(context.staff._id)
  )
  const author = assigned && isReportAuthor(context, report)
  const management = isReportManager(context)
  const fields = reconciliation.fields.filter(
    (field) =>
      management ||
      author ||
      String(field.reviewerStaffId || '') === String(context.staff._id)
  )
  if (!fields.length) return null
  const ids = new Set(fields.map((field) => field.fieldId))
  return {
    _id: String(reconciliation._id),
    reportId: String(reconciliation.reportId),
    orderId: String(reconciliation.orderId),
    staffId: String(reconciliation.staffId),
    reportTemplateVersion: reconciliation.reportTemplateVersion,
    status: reconciliation.status,
    revision: reconciliation.revision,
    submittedAt: reconciliation.submittedAt || null,
    canEdit: author,
    canImport: management,
    fields: fields.map((field) => ({
      fieldId: field.fieldId,
      label: field.label,
      key: field.key,
      valueType: field.valueType,
      required: field.required,
      canReview:
        management ||
        String(field.reviewerStaffId || '') === String(context.staff._id),
    })),
    values: reconciliation.values
      .filter((value) => ids.has(value.fieldId))
      .map(serializeValue),
  }
}
