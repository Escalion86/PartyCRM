import mongoose from 'mongoose'
import pushReminderLogsSchema from '@schemas/pushReminderLogsSchema'

const PushReminderLogsSchema = new mongoose.Schema(pushReminderLogsSchema, {
  timestamps: true,
})

PushReminderLogsSchema.index(
  {
    tenantId: 1,
    eventId: 1,
    additionalEventIndex: 1,
    reminderType: 1,
    dateKey: 1,
  },
  { unique: true, sparse: true }
)

PushReminderLogsSchema.index(
  {
    tenantId: 1,
    eventId: 1,
    reminderType: 1,
    dateKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: { additionalEventIndex: { $type: 'null' } },
  }
)

PushReminderLogsSchema.index(
  {
    tenantId: 1,
    orderId: 1,
    additionalEventId: 1,
    additionalEventIndex: 1,
    reminderType: 1,
    dateKey: 1,
  },
  {
    unique: true,
    partialFilterExpression: { orderId: { $exists: true, $ne: null } },
  }
)

export default mongoose.models.PushReminderLogs ||
  mongoose.model('PushReminderLogs', PushReminderLogsSchema)
