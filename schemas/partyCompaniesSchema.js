import { Schema } from 'mongoose'

const partyCompaniesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  title: {
    type: String,
    trim: true,
    required: true,
    maxlength: 160,
  },
  legalTitle: {
    type: String,
    trim: true,
    default: '',
    maxlength: 240,
  },
  phone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    maxlength: 160,
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'archived'],
    default: 'active',
  },
  settings: {
    type: Schema.Types.Mixed,
    default: {},
  },
  tariffId: {
    type: Schema.Types.ObjectId,
    ref: 'Tariff',
    default: null,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  billingStatus: {
    type: String,
    enum: ['active', 'paused', 'debt', 'cancelled'],
    default: 'active',
  },
  tariffActiveUntil: {
    type: Date,
    default: null,
  },
  nextChargeAt: {
    type: Date,
    default: null,
  },
  trialActivatedAt: {
    type: Date,
    default: null,
  },
  trialEndsAt: {
    type: Date,
    default: null,
  },
  trialUsed: {
    type: Boolean,
    default: false,
  },
}

export default partyCompaniesSchema
