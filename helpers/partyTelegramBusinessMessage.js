const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export const getPartyTelegramBusinessMessageDirection = ({
  message,
  businessAccountUserId,
}) => {
  if (message?.sender_business_bot) return 'outgoing'

  const senderId = String(message?.from?.id || '')
  const chatId = String(message?.chat?.id || '')
  const accountUserId = String(businessAccountUserId || '')

  if (accountUserId && senderId === accountUserId) return 'outgoing'
  if (senderId && chatId && senderId !== chatId) return 'outgoing'

  return 'incoming'
}

export const isPartyTelegramReplyWindowOpen = (lastIncomingAt, now = Date.now()) => {
  const timestamp = new Date(lastIncomingAt || 0).getTime()
  return Number.isFinite(timestamp) && now - timestamp <= REPLY_WINDOW_MS
}
