import { Schema } from 'mongoose'

const partyClientsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  firstName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  secondName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  thirdName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  phone: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  whatsapp: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  viber: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  telegram: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  instagram: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  vk: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  preferredContactChannel: {
    type: String,
    enum: ['phone', 'telegram', 'whatsapp', 'max', 'vk', 'other', ''],
    default: '',
  },
  preferredContactChannelOther: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    maxlength: 160,
  },
  telegramUserId: {
    type: String,
    trim: true,
    default: '',
    maxlength: 80,
  },
  leadSource: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  town: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  isLegalEntity: {
    type: Boolean,
    default: false,
  },
  legalName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 240,
  },
  inn: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  kpp: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  ogrn: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  bankName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 240,
  },
  bik: {
    type: String,
    trim: true,
    default: '',
    maxlength: 40,
  },
  checkingAccount: {
    type: String,
    trim: true,
    default: '',
    maxlength: 60,
  },
  correspondentAccount: {
    type: String,
    trim: true,
    default: '',
    maxlength: 60,
  },
  legalAddress: {
    type: String,
    trim: true,
    default: '',
    maxlength: 400,
  },
  significantDates: {
    type: [
      {
        title: { type: String, trim: true, default: '', maxlength: 100 },
        date: { type: Date, default: null },
        comment: { type: String, trim: true, default: '', maxlength: 500 },
      },
    ],
    default: [],
  },
  comment: {
    type: String,
    trim: true,
    default: '',
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
  },
}

export default partyClientsSchema
