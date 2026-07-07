import { Schema } from 'mongoose'

const pushReminderLogsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  additionalEventId: {
    type: String,
    trim: true,
    default: '',
  },
  additionalEventIndex: {
    type: Number,
    default: null,
  },
  reminderType: {
    type: String,
    required: true,
    enum: ['today', 'tomorrow', 'overdue', 'upcoming'],
  },
  dateKey: {
    type: String,
    required: true,
  },
  sentAt: {
    type: Date,
    default: () => new Date(),
  },
}

export default pushReminderLogsSchema
