import mongoose from 'mongoose'
import avitoConversationsSchema from '@schemas/avitoConversationsSchema'

const AvitoConversationsSchema = new mongoose.Schema(
  avitoConversationsSchema,
  { timestamps: true }
)

AvitoConversationsSchema.index(
  { tenantId: 1, avitoChatId: 1 },
  { unique: true }
)
AvitoConversationsSchema.index({ tenantId: 1, clientId: 1, lastMessageAt: -1 })
AvitoConversationsSchema.index({ tenantId: 1, eventId: 1, lastMessageAt: -1 })
AvitoConversationsSchema.index({ tenantId: 1, avitoUserId: 1 })

export default mongoose.models.AvitoConversations ||
  mongoose.model('AvitoConversations', AvitoConversationsSchema)
