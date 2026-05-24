import mongoose from 'mongoose'
import usersSchema from '@schemas/usersSchema'

const UsersSchema = new mongoose.Schema(usersSchema, { timestamps: true })
UsersSchema.index({ phone: 1 }, { unique: true, sparse: true })
UsersSchema.index({ vkId: 1 }, { unique: true, sparse: true })
UsersSchema.index({ tenantId: 1, role: 1 })

export default mongoose.models.Users || mongoose.model('Users', UsersSchema)
