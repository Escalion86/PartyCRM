import { Schema } from 'mongoose'

const partyAvitoConversationsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
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
  avitoUserId: {
    type: String,
    default: '',
  },
  avitoItemId: {
    type: String,
    default: '',
  },
  avitoItemTitle: {
    type: String,
    default: '',
  },
  clientName: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'ignored'],
    default: 'open',
  },
  lastMessageText: {
    type: String,
    default: '',
  },
  lastMessageAt: {
    type: Date,
    default: null,
  },
  unreadCount: {
    type: Number,
    default: 0,
  },
  raw: {
    type: Schema.Types.Mixed,
    default: null,
  },
}

export default partyAvitoConversationsSchema
