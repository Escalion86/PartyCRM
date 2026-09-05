import sanitizeHtml from 'sanitize-html'

export const reportFailure = (message, status = 400, code = 'partycrm_invalid_report') => {
  const error = new Error(message)
  error.status = status
  error.code = code
  throw error
}

export const isReportManager = (context) => ['owner', 'admin'].includes(context?.role)
export const isReportAuthor = (context, report) => String(context?.staff?._id) === String(report?.staffId)
export const canReviewReportField = (context, field) =>
  isReportManager(context) || String(field?.reviewerStaffId || '') === String(context?.staff?._id)

export const canReadReportField = (context, report, field, isAssigned = false) =>
  context?.role !== 'location_owner' && (
  isReportManager(context) || (isAssigned && isReportAuthor(context, report)) ||
  canReviewReportField(context, field) ||
  (context?.role === 'performer' && field.section === 'creative' && field.shareCreative === true &&
    report.answers.some((answer) => answer.fieldId === field.id && answer.status === 'accepted')))

export const getSharedCreativeAnswers = (report) => (report.templateSnapshot?.fields || []).flatMap((field) => {
  if (field.section !== 'creative' || field.shareCreative !== true) return []
  const answer = (report.answers || []).find((item) => item.fieldId === field.id && item.status === 'accepted')
  return answer ? [{ field, answer }] : []
})

export const serializeReportLibraryItems = (report, { orderTitle = 'Мероприятие', eventDate = null, staffName = 'Исполнитель' } = {}) =>
  getSharedCreativeAnswers(report).map(({ field, answer }) => ({
    id: `${report._id}:${field.id}`,
    label: field.label,
    html: answer.html || '',
    notApplicable: Boolean(answer.notApplicable),
    notApplicableReason: answer.notApplicableReason || '',
    orderTitle, eventDate, staffName,
  }))

export const sanitizeReportHtml = (html) => {
  if (typeof html !== 'string' || html.length > 100000) reportFailure('Ответ слишком длинный')
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'code', 'pre'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^\/api\/party\/report-media\/[a-f\d]{24}$/i.test(frame.attribs.src || ''),
  })
}

export const reportHasContent = (html = '') =>
  /<img\s/i.test(html) || Boolean(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|&#160;|\s/g, '').trim())

export const reportMediaIds = (html = '') => [...html.matchAll(/src="\/api\/party\/report-media\/([a-f\d]{24})"/gi)].map((match) => match[1])

export const reportStatusFromAnswers = (answers) => {
  if (answers.every((answer) => answer.status === 'accepted')) return 'accepted'
  if (answers.some((answer) => answer.status === 'revision_requested')) return 'revision_requested'
  if (answers.some((answer) => answer.status === 'draft')) return 'draft'
  return 'submitted'
}

// Pure transition guard shared by the route and focused regression tests.
export const updateReportAnswers = ({ report, context, action, answers = {}, fieldId, decision, comment = '', eventDate, now = new Date() }) => {
  const fields = report.templateSnapshot.fields
  let next = report.answers.map((answer) => ({ ...answer }))
  if (action === 'save' || action === 'submit') {
    if (!isReportAuthor(context, report)) reportFailure('Изменять ответы может только автор', 403)
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) reportFailure('Некорректные ответы')
    for (const [key, value] of Object.entries(answers)) {
      const answer = next.find((item) => item.fieldId === key)
      const field = fields.find((item) => item.id === key)
      if (!answer) reportFailure('Поле не найдено')
      const payload = typeof value === 'string' ? { html: value } : value
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reportFailure('Некорректный ответ поля')
      const sanitized = sanitizeReportHtml(payload.html ?? answer.html ?? '')
      if (payload.notApplicable !== undefined && typeof payload.notApplicable !== 'boolean') reportFailure('Некорректная отметка «не применимо»')
      const notApplicable = payload.notApplicable ?? Boolean(answer.notApplicable)
      const reason = payload.notApplicableReason ?? answer.notApplicableReason ?? ''
      if (typeof reason !== 'string' || reason.length > 2000) reportFailure('Причина должна содержать не более 2000 символов')
      const notApplicableReason = notApplicable ? reason.trim() : ''
      if (notApplicable && field?.allowNotApplicable !== true) reportFailure(`Для поля «${field?.label || key}» нельзя выбрать «не применимо»`)
      if (['accepted', 'submitted'].includes(answer.status)) {
        if (sanitized !== answer.html || notApplicable !== Boolean(answer.notApplicable) || notApplicableReason !== (answer.notApplicableReason || '')) reportFailure('Отправленное или принятое поле можно менять только после возврата на доработку', 409)
        continue
      }
      Object.assign(answer, { html: sanitized, notApplicable, notApplicableReason })
    }
    if (action === 'submit') {
      if (report.stage === 'after' && (!eventDate || !Number.isFinite(new Date(eventDate).getTime()) || new Date(eventDate) > now)) reportFailure('Итоговый отчёт можно отправить после начала мероприятия')
      for (const field of fields) {
        const answer = next.find((item) => item.fieldId === field.id)
        if (answer?.notApplicable) {
          if (field.allowNotApplicable !== true) reportFailure(`Для поля «${field.label}» нельзя выбрать «не применимо»`)
          if (!answer.notApplicableReason?.trim()) reportFailure(`Укажите причину «не применимо» для поля «${field.label}»`)
          continue
        }
        if (field.required && !reportHasContent(answer?.html)) reportFailure(`Заполните поле «${field.label}»`)
        if (field.requiredMedia === true && !reportMediaIds(answer?.html).length) reportFailure(`Добавьте фотографию в поле «${field.label}»`)
      }
      next = next.map((answer) => answer.status === 'accepted' ? answer : { ...answer, status: 'submitted', reviewComment: '', reviewedByStaffId: '', reviewedAt: null })
    }
  } else if (action === 'review') {
    const field = fields.find((item) => item.id === fieldId)
    const answer = next.find((item) => item.fieldId === fieldId)
    if (!field || !answer || !canReviewReportField(context, field)) reportFailure('Нет доступа к проверке поля', 403)
    if (!['accepted', 'revision_requested'].includes(decision)) reportFailure('Некорректное решение')
    if (!['submitted', 'accepted'].includes(answer.status) || (answer.status === 'accepted' && decision !== 'revision_requested')) reportFailure('Поле ещё не отправлено или уже проверено', 409)
    if (typeof comment !== 'string' || comment.length > 2000) reportFailure('Комментарий слишком длинный')
    if (decision === 'revision_requested' && !comment.trim()) reportFailure('Укажите причину возврата на доработку')
    Object.assign(answer, { status: decision, reviewComment: comment.trim(), reviewedAt: now, reviewedByStaffId: String(context.staff._id) })
  } else reportFailure('Неизвестное действие')
  return next
}
