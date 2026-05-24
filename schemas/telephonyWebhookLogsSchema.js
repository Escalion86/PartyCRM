import { Schema } from 'mongoose'

const telephonyWebhookLogsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
    index: true,
  },
  provider: {
    type: String,
    default: '',
    trim: true,
  },
  eventType: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    required: true,
    trim: true,
  },
  httpStatus: {
    type: Number,
    default: null,
  },
  reason: {
    type: String,
    default: '',
    trim: true,
  },
  message: {
    type: String,
    default: '',
    trim: true,
  },
  providerCallId: {
    type: String,
    default: '',
    trim: true,
  },
  direction: {
    type: String,
    default: '',
    trim: true,
  },
  hasRecordingUrl: {
    type: Boolean,
    default: false,
  },
  hasTranscript: {
    type: Boolean,
    default: false,
  },
  callId: {
    type: Schema.Types.ObjectId,
    ref: 'Calls',
    default: null,
  },
  payloadKeys: {
    type: [String],
    default: [],
  },
  meta: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
}

export default telephonyWebhookLogsSchema
