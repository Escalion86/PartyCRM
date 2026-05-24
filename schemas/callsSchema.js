import { Schema } from 'mongoose'

const callsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
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
  recordingStorageKey: {
    type: String,
    default: '',
  },
  recordingExpiresAt: {
    type: Date,
    default: null,
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
    type: {
      clientName: { type: String, default: '' },
      eventType: { type: String, default: '' },
      eventDate: { type: Date, default: null },
      eventCity: { type: String, default: '' },
      eventLocation: { type: String, default: '' },
      guestCount: { type: String, default: '' },
      budget: { type: Number, default: null },
      nextContactAt: { type: Date, default: null },
      nextContactReason: { type: String, default: '' },
      objections: { type: [String], default: [] },
      confidence: { type: Number, default: 0 },
    },
    default: () => ({}),
  },
  linkedClientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  linkedEventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
    default: null,
  },
  eventDecision: {
    type: String,
    enum: ['pending', 'create_event', 'no_event', 'created', 'failed', ''],
    default: '',
  },
  eventDecisionAt: {
    type: Date,
    default: null,
  },
  eventPromptSentAt: {
    type: Date,
    default: null,
  },
  recordingPushSentAt: {
    type: Date,
    default: null,
  },
  processingError: {
    type: String,
    default: '',
  },
}

export default callsSchema
