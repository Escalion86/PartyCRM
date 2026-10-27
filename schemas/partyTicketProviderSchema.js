import { Schema } from 'mongoose'

export const partyTicketProviderSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  provider: { type: String, enum: ['ticketscloud', 'evotor'], required: true },
  credential: { type: Schema.Types.Mixed, select: false, default: null },
  configured: { type: Boolean, default: false },
  storeUuid: { type: String, maxlength: 36, default: '' },
  revision: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  status: { type: String, enum: ['unconfigured', 'unchecked', 'verified', 'error'], default: 'unconfigured' },
  lastCheckedAt: { type: Date, default: null },
  lastErrorCode: { type: String, maxlength: 80, default: '' },
}
