import mongoose from 'mongoose'
import vkMessagesSchema from '@schemas/vkMessagesSchema'

const VkMessagesSchema = new mongoose.Schema(vkMessagesSchema, {
  timestamps: true,
})

VkMessagesSchema.index({ tenantId: 1, conversationId: 1, sentAt: 1 })
VkMessagesSchema.index({ tenantId: 1, vkPeerId: 1, vkMessageId: 1 })
VkMessagesSchema.index({ tenantId: 1, clientId: 1, sentAt: -1 })
VkMessagesSchema.index({ tenantId: 1, eventId: 1, sentAt: -1 })

export default mongoose.models.VkMessages ||
  mongoose.model('VkMessages', VkMessagesSchema)
