import { Schema } from 'mongoose'

const expoPushTokensSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
    index: true,
  },
  pushToken: {
    type: String,
    required: true,
    trim: true,
  },
  deviceId: {
    type: String,
    default: '',
    trim: true,
  },
  platform: {
    type: String,
    enum: ['android', 'ios', ''],
    default: '',
  },
  appVersion: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSentAt: {
    type: Date,
    default: null,
  },
}

export default expoPushTokensSchema
