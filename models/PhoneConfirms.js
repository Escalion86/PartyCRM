import mongoose from 'mongoose'
import phoneConfirmsSchema from '@schemas/phoneConfirmsSchema'

const PhoneConfirmsSchema = new mongoose.Schema(phoneConfirmsSchema, {
  timestamps: true,
})

PhoneConfirmsSchema.index({ phone: 1, flow: 1 }, { unique: true })
PhoneConfirmsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.models.PhoneConfirms ||
  mongoose.model('PhoneConfirms', PhoneConfirmsSchema)
