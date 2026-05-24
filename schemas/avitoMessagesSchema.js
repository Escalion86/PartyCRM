import { Schema } from 'mongoose'

const avitoMessagesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'AvitoConversations',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
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

export default avitoMessagesSchema
