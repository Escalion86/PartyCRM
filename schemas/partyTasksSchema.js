import { Schema } from 'mongoose'

const id = { type: Schema.Types.ObjectId, default: null }
const partyTasksSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  descriptionHtml: { type: String, default: '', maxlength: 100000 },
  status: { type: String, enum: ['new', 'in_progress', 'done', 'canceled'], default: 'new' },
  orderId: id,
  locationId: id,
  assigneeStaffIds: [{ type: Schema.Types.ObjectId }],
  assigneeRoleId: id,
  createdByStaffId: id,
  createdByUserId: id,
  dueAt: { type: Date, default: null },
  completedByStaffId: id,
  completedByUserId: id,
  completedAt: { type: Date, default: null },
  revision: { type: Number, default: 0 },
  recurrenceRevision: { type: Number, default: 0 },
  effectsLockToken: { type: String, default: '' },
  effectsLockUntil: { type: Date, default: null },
  effectsPending: { type: Boolean, default: true },
  pendingNotifications: [new Schema({ key: String, event: String, revision: Number }, { _id: false })],
  sourceKey: { type: String, default: undefined },
  creationRequestHash: { type: String, default: '' },
  legacySourceTitle: { type: String, default: '' },
  mediaRevision: { type: Number, default: 0 },
  recurrence: {
    frequency: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
    interval: { type: Number, default: 1, min: 1, max: 365 },
    until: { type: Date, default: null },
  },
  seriesId: id,
  seriesTemplate: { type: Schema.Types.Mixed, default: null },
  seriesTemplateMediaTaskId: id,
  mediaSourceTaskId: id,
  seriesGeneration: { type: Number, default: 0 },
  seriesPreview: { type: Schema.Types.Mixed, default: null },
  seriesActive: { type: Boolean, default: false },
  nextOccurrenceAt: { type: Date, default: null },
  occurrenceAt: { type: Date, default: null },
  recurrenceAnchorDay: { type: Number, default: null },
  timeZone: { type: String, default: 'Europe/Moscow' },
  history: [{
    action: { type: String, required: true },
    staffId: id,
    userId: id,
    at: { type: Date, default: Date.now },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
  }],
  calendarLinks: [{
    staffId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, default: null },
    calendarId: { type: String, default: '' },
    eventId: { type: String, default: '' },
    error: { type: String, default: '' },
  }],
  reminders: [{ staffId: { type: Schema.Types.ObjectId }, dateKey: String }],
}

export const partyTaskMediaSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  taskId: { type: Schema.Types.ObjectId, default: null },
  uploadedByUserId: { type: Schema.Types.ObjectId, required: true },
  draftKey: { type: String, default: '' },
  mimeType: { type: String, default: 'image/webp' },
  size: { type: Number, required: true },
  bytes: { type: Buffer, required: true, select: false },
}

export const partyTaskDraftSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  draftKey: { type: String, required: true },
  taskId: { type: Schema.Types.ObjectId, default: null },
  revision: { type: Number, default: 0 },
}

export default partyTasksSchema
