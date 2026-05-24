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
}

export default partyCompaniesSchema
