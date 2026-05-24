import mongoose from 'mongoose'
import callsSchema from '@schemas/callsSchema'

const CallsSchema = new mongoose.Schema(callsSchema, { timestamps: true })

CallsSchema.index(
  { tenantId: 1, provider: 1, providerCallId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerCallId: { $type: 'string', $gt: '' },
    },
  }
)
CallsSchema.index({ tenantId: 1, normalizedPhone: 1, startedAt: -1 })
CallsSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export default mongoose.models.Calls || mongoose.model('Calls', CallsSchema)
