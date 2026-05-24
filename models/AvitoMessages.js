import mongoose from 'mongoose'
import avitoMessagesSchema from '@schemas/avitoMessagesSchema'

const AvitoMessagesSchema = new mongoose.Schema(avitoMessagesSchema, {
  timestamps: true,
})

AvitoMessagesSchema.index({ tenantId: 1, conversationId: 1, sentAt: 1 })
AvitoMessagesSchema.index({ tenantId: 1, avitoChatId: 1, avitoMessageId: 1 })
AvitoMessagesSchema.index({ tenantId: 1, clientId: 1, sentAt: -1 })
AvitoMessagesSchema.index({ tenantId: 1, eventId: 1, sentAt: -1 })

export default mongoose.models.AvitoMessages ||
  mongoose.model('AvitoMessages', AvitoMessagesSchema)
