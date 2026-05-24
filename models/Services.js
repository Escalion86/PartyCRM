import mongoose from 'mongoose'
import servicesSchema from '@schemas/servicesSchema'

const ServicesSchema = new mongoose.Schema(servicesSchema, { timestamps: true })
ServicesSchema.index({ tenantId: 1, title: 1 })

export default mongoose.models.Services ||
  mongoose.model('Services', ServicesSchema)
