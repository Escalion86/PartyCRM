import { Schema } from 'mongoose'

const partyAvitoMessagesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyAvitoConversation',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  avitoChatId: {
    type: String,
    required: true,
  },
  avitoMessageId: {
    type: String,
    default: '',
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true,
  },
  text: {
    type: String,
    default: '',
  },
  sentAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['received', 'sent', 'failed'],
    default: 'received',
  },
  raw: {
    type: Schema.Types.Mixed,
    default: null,
  },
}

export default partyAvitoMessagesSchema
