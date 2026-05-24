import { Schema } from 'mongoose'

const vkConversationsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
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
  vkUserId: {
    type: String,
    default: '',
  },
  vkGroupId: {
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

export default vkConversationsSchema
