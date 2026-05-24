import { Schema } from 'mongoose'

const vkMessagesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'VkConversations',
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
  vkPeerId: {
    type: String,
    required: true,
  },
  vkMessageId: {
    type: String,
    default: '',
  },
  vkUserId: {
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
  attachments: {
    type: [Schema.Types.Mixed],
    default: [],
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

export default vkMessagesSchema
