import { Schema } from 'mongoose'

const partyCallsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  provider: {
    type: String,
    default: 'manual',
  },
  providerCallId: {
    type: String,
    default: '',
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing', 'unknown'],
    default: 'unknown',
  },
  phone: {
    type: String,
    default: '',
  },
  normalizedPhone: {
    type: String,
    default: '',
  },
  startedAt: {
    type: Date,
    default: null,
  },
  endedAt: {
    type: Date,
    default: null,
  },
  durationSec: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['new', 'processing', 'ready', 'linked', 'ignored', 'failed'],
    default: 'new',
  },
  recordingUrl: {
    type: String,
    default: '',
  },
  transcript: {
    type: String,
    default: '',
  },
  aiSummary: {
    type: String,
    default: '',
  },
  aiExtractedFields: {
    type: Schema.Types.Mixed,
    default: {},
  },
  linkedClientId: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
  },
  linkedOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  orderDraft: {
    type: Schema.Types.Mixed,
    default: null,
  },
  eventDecision: {
    type: String,
    enum: ['pending', 'create_order', 'no_order', 'created', 'failed', ''],
    default: '',
  },
  eventDecisionAt: {
    type: Date,
    default: null,
  },
  processingError: {
    type: String,
    default: '',
  },
  raw: {
    type: Schema.Types.Mixed,
    default: null,
  },
}

export default partyCallsSchema
