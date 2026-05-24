import mongoose from 'mongoose'
import siteSettingsSchema from '@schemas/siteSettingsSchema'

const SiteSettingsSchema = new mongoose.Schema(siteSettingsSchema, {
  timestamps: true,
})
SiteSettingsSchema.index({ tenantId: 1 }, { unique: true, sparse: true })

export default mongoose.models.SiteSettings ||
  mongoose.model('SiteSettings', SiteSettingsSchema)
