import { Schema } from 'mongoose'

const partyStaffSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyCompanies',
    required: true,
    index: true,
  },
  authUserId: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  linkedAuthUserId: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  firstName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 100,
  },
  secondName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 100,
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
  specialization: {
    type: String,
    enum: ['', 'animator', 'magician', 'host', 'photographer', 'workshop', 'other'],
    default: '',
    index: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1000,
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'performer'],
    default: 'performer',
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'invited', 'paused', 'archived'],
    default: 'active',
  },
  visibleToPerformer: {
    type: Boolean,
    default: true,
  },
  linkStatus: {
    type: String,
    enum: ['unlinked', 'link_requested', 'linked', 'rejected'],
    default: 'unlinked',
    index: true,
  },
  linkRequestedAt: {
    type: Date,
    default: null,
  },
  linkConfirmedAt: {
    type: Date,
    default: null,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
}

export default partyStaffSchema
