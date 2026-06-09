import mongoose from 'mongoose'
import pushSubscriptionsSchema from '@schemas/pushSubscriptionsSchema'

const PushSubscriptionsSchema = new mongoose.Schema(pushSubscriptionsSchema, {
  timestamps: true,
})

PushSubscriptionsSchema.index({ tenantId: 1, endpoint: 1 }, { unique: true })
PushSubscriptionsSchema.index({ product: 1, companyId: 1, isActive: 1 })

export default mongoose.models.PushSubscriptions ||
  mongoose.model('PushSubscriptions', PushSubscriptionsSchema)
