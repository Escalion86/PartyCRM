import mongoose from 'mongoose'
import telephonyWebhookLogsSchema from '@schemas/telephonyWebhookLogsSchema'

const TelephonyWebhookLogsSchema = new mongoose.Schema(
  telephonyWebhookLogsSchema,
  { timestamps: true }
)

TelephonyWebhookLogsSchema.index({ provider: 1, createdAt: -1 })
TelephonyWebhookLogsSchema.index({ tenantId: 1, provider: 1, createdAt: -1 })
TelephonyWebhookLogsSchema.index({ provider: 1, providerCallId: 1 })

export default mongoose.models.TelephonyWebhookLogs ||
  mongoose.model('TelephonyWebhookLogs', TelephonyWebhookLogsSchema)
