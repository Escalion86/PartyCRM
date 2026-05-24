import mongoose from 'mongoose'
import eventsSchema from '@schemas/eventsSchema'

const EventsSchema = new mongoose.Schema(eventsSchema, { timestamps: true })
EventsSchema.index({ tenantId: 1, eventDate: -1 })
EventsSchema.index({ tenantId: 1, status: 1 })
EventsSchema.index({ tenantId: 1, clientId: 1 })
EventsSchema.index({ tenantId: 1, eventDate: -1, status: 1, clientId: 1 })

export default mongoose.models.Events || mongoose.model('Events', EventsSchema)
