import { Schema } from 'mongoose'

const partyTelegramConversationsSchema = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  businessConnectionId: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  telegramUserId: { type: String, default: '' },
  telegramUsername: { type: String, default: '' },
  clientName: { type: String, default: '' },
  status: { type: String, enum: ['open', 'closed', 'ignored'], default: 'open' },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: null },
  lastIncomingAt: { type: Date, default: null },
  unreadCount: { type: Number, default: 0 },
}

export default partyTelegramConversationsSchema
