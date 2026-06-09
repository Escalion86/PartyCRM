import { Schema } from 'mongoose'

const pushDeliveryLogsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
    index: true,
  },
  product: {
    type: String,
    enum: ['artistcrm', 'partycrm'],
    default: 'artistcrm',
    index: true,
  },
  companyId: {
    type: Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  source: {
    type: String,
    default: '',
    trim: true,
  },
  eventType: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    default: '',
    trim: true,
  },
  payloadType: {
    type: String,
    default: '',
    trim: true,
  },
  endpointHash: {
    type: String,
    default: '',
    trim: true,
  },
  endpointHost: {
    type: String,
    default: '',
    trim: true,
  },
  statusCode: {
    type: Number,
    default: null,
  },
  subscriptions: {
    type: Number,
    default: null,
  },
  sent: {
    type: Number,
    default: null,
  },
  failed: {
    type: Number,
    default: null,
  },
  deactivated: {
    type: Number,
    default: null,
  },
  meta: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
}

export default pushDeliveryLogsSchema
