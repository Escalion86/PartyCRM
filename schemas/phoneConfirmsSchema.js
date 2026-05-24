import { Schema } from 'mongoose'

const phoneConfirmsSchema = {
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  flow: {
    type: String,
    enum: ['register', 'recovery'],
    required: true,
  },
  callId: {
    type: Number,
    default: null,
  },
  code: {
    type: String,
    default: '',
  },
  confirmed: {
    type: Boolean,
    default: false,
  },
  tryNum: {
    type: Number,
    default: 0,
  },
  smsSendNum: {
    type: Number,
    default: 0,
  },
  smsSentAt: {
    type: Date,
    default: null,
  },
  lastCheckAt: {
    type: Date,
    default: null,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}

export default phoneConfirmsSchema
