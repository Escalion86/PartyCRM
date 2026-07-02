import { Schema } from 'mongoose'

const partyVkMessagesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyVkConversation',
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
  vkGroupId: {
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

export default partyVkMessagesSchema
