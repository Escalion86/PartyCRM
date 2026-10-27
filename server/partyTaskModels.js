import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import partyTasksSchema, { partyTaskMediaSchema, partyTaskDraftSchema } from '@schemas/partyTasksSchema'

export const getPartyTaskModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM, name: 'Task', collectionName: 'tasks',
  schemaDefinition: partyTasksSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => {
    schema.index({ tenantId: 1, status: 1, dueAt: 1 })
    schema.index({ tenantId: 1, assigneeStaffIds: 1, dueAt: 1 })
    schema.index({ tenantId: 1, assigneeRoleId: 1, dueAt: 1 })
    schema.index({ tenantId: 1, orderId: 1 })
    schema.index({ tenantId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } })
    schema.index({ tenantId: 1, seriesId: 1, seriesGeneration: 1, occurrenceAt: 1 }, { unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' }, occurrenceAt: { $type: 'date' } } })
    schema.index({ seriesActive: 1, nextOccurrenceAt: 1 })
    schema.index({ tenantId: 1, effectsPending: 1, updatedAt: 1 })
  },
})

// Generation and cancellation of an entire series must write the same root
// document in one transaction. No external side effect belongs in this callback.
export const withPartyTaskSeriesMutation = async ({ tenantId, taskId, work, Tasks: suppliedTasks = null }) => {
  const Tasks = suppliedTasks || await getPartyTaskModel()
  const session = await Tasks.db.startSession()
  try {
    return await session.withTransaction(async () => {
      const task = await Tasks.findOne({ _id: taskId, tenantId }).session(session).lean()
      if (!task) return null
      const rootId = task.seriesId || task._id
      await Tasks.updateOne({ _id: rootId, tenantId }, { $inc: { recurrenceRevision: 1 } }, { session })
      return work({ session, task, rootId, Tasks })
    })
  } finally { await session.endSession() }
}

export const getPartyTaskMediaModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM, name: 'TaskMedia', collectionName: 'taskMedia',
  schemaDefinition: partyTaskMediaSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, taskId: 1 }),
})

export const getPartyTaskDraftModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM, name: 'TaskDraft', collectionName: 'taskDrafts',
  schemaDefinition: partyTaskDraftSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, userId: 1, draftKey: 1 }, { unique: true }),
})
