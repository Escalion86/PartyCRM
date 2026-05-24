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
    required: true,
  },
  additionalEventIndex: {
    type: Number,
    default: null,
  },
  reminderType: {
    type: String,
    required: true,
    enum: ['tomorrow', 'overdue'],
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
