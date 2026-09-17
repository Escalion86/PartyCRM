export const PARTY_INBOX_CHANNELS = ['vk', 'avito', 'telegram', 'novofon']
export const PARTY_INBOX_SALES_STAGES = {
  new: 'Новая заявка',
  qualification: 'Уточнение потребностей',
  proposal: 'Предложение отправлено',
  negotiation: 'Согласование',
  won: 'Забронировано',
  lost: 'Отказ',
}
export const PARTY_INBOX_STATUSES = {
  needs_reply: 'Нужен ответ',
  in_progress: 'В работе',
  waiting_client: 'Ждём клиента',
  follow_up: 'Связаться позже',
  resolved: 'Решено',
}

export const partyInboxKey = (channel, sourceId) => `${channel}:${sourceId}`

// Only an incoming message reopens an explicitly handled conversation.
// Reading it or receiving delivery updates must not change the workflow.
export const resolvePartyInboxStatus = (state, incomingToken = '', direction = '') => {
  if (incomingToken && state?.acknowledgedIncomingToken !== incomingToken) return 'needs_reply'
  return state?.status || (direction === 'outgoing' ? 'in_progress' : 'needs_reply')
}

export const parsePartyInboxPatch = (body) => {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Некорректные данные')
  const { status, nextContactAt, expectedRevision } = body
  if (!Object.hasOwn(PARTY_INBOX_STATUSES, status)) throw new Error('Выберите состояние диалога')
  const date = nextContactAt ? new Date(nextContactAt) : null
  if (date && !Number.isFinite(date.getTime())) throw new Error('Некорректная дата контакта')
  if (status === 'follow_up' && !date) throw new Error('Укажите дату следующего контакта')
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Обновите список входящих')
  const result = { status, nextContactAt: date, expectedRevision }
  if (Object.hasOwn(body, 'salesStage')) {
    if (!Object.hasOwn(PARTY_INBOX_SALES_STAGES, body.salesStage)) throw new Error('Выберите этап продажи')
    const lostReason = typeof body.lostReason === 'string' ? body.lostReason.trim() : ''
    if (body.salesStage === 'lost' && (!lostReason || lostReason.length > 1000)) throw new Error('Укажите причину отказа (до 1000 символов)')
    if (body.salesStage === 'won' && !body.orderId) throw new Error('Свяжите забронированную заявку с заказом')
    result.salesStage = body.salesStage
    result.lostReason = body.salesStage === 'lost' ? lostReason : ''
  }
  for (const field of ['assigneeStaffId', 'clientId', 'orderId']) {
    const value = body[field]
    if (value != null && value !== '' && (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))) throw new Error('Некорректная ссылка на запись')
    result[field] = value || null
  }
  return result
}

export const buildPartyInboxWorkflowUpdate = ({ patch, current, channel, actorStaffId, now = new Date() }) => {
  const fields = { ...patch }
  delete fields.expectedRevision
  const events = []
  if (fields.status === 'resolved') fields.nextContactAt = null
  if (fields.salesStage && (
    fields.salesStage !== (current?.salesStage || 'new') ||
    fields.lostReason !== (current?.lostReason || '')
  )) events.push({
    type: 'sales_stage_changed', at: now, byStaffId: actorStaffId,
    fromSalesStage: current?.salesStage || 'new', toSalesStage: fields.salesStage,
    lostReason: fields.lostReason,
  })
  // A phone conversation has no outgoing message in the same chain; the
  // manager explicitly recording its result is the acknowledgement.
  if (channel === 'novofon' && fields.status !== 'needs_reply' && current?.responseDueAt && !current.respondedAt) {
    fields.responseDueAt = null
    fields.respondedAt = now
    fields.responseToken = `call-result:${current.revision || 0}`
    events.push({ type: 'sla_answered', at: now, token: fields.responseToken, byStaffId: actorStaffId })
  }
  return { fields, events }
}
