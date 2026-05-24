import mongoose from 'mongoose'
import expoPushTokensSchema from '@schemas/expoPushTokensSchema'

const ExpoPushTokensSchema = new mongoose.Schema(expoPushTokensSchema, {
  timestamps: true,
})

ExpoPushTokensSchema.index({ tenantId: 1, pushToken: 1 }, { unique: true })
ExpoPushTokensSchema.index({ tenantId: 1, isActive: 1 })

export default mongoose.models.ExpoPushTokens ||
  mongoose.model('ExpoPushTokens', ExpoPushTokensSchema)
