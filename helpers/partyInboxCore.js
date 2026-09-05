export const PARTY_INBOX_CHANNELS = ['vk', 'avito', 'telegram', 'novofon']
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
  for (const field of ['assigneeStaffId', 'clientId', 'orderId']) {
    const value = body[field]
    if (value != null && value !== '' && (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))) throw new Error('Некорректная ссылка на запись')
    result[field] = value || null
  }
  return result
}
