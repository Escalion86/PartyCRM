import mongoose from 'mongoose'
import vkConversationsSchema from '@schemas/vkConversationsSchema'

const VkConversationsSchema = new mongoose.Schema(vkConversationsSchema, {
  timestamps: true,
})

VkConversationsSchema.index(
  { tenantId: 1, vkPeerId: 1 },
  { unique: true }
)
VkConversationsSchema.index({ tenantId: 1, clientId: 1, lastMessageAt: -1 })
VkConversationsSchema.index({ tenantId: 1, eventId: 1, lastMessageAt: -1 })
VkConversationsSchema.index({ tenantId: 1, vkUserId: 1 })

export default mongoose.models.VkConversations ||
  mongoose.model('VkConversations', VkConversationsSchema)
