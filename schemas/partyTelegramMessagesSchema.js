import { Schema } from 'mongoose'

const partyTelegramMessagesSchema = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'PartyTelegramConversation', required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  businessConnectionId: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  telegramMessageId: { type: String, required: true },
  direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
  text: { type: String, default: '' },
  attachments: { type: [Schema.Types.Mixed], default: [] },
  sentAt: { type: Date, default: null },
  status: { type: String, enum: ['received', 'sent', 'failed'], default: 'received' },
}

export default partyTelegramMessagesSchema
