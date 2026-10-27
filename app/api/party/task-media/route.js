import sharp from 'sharp'
import { getPartyTaskMediaModel, withPartyTaskSeriesMutation } from '@server/partyTaskModels'
import { withTaskContext, taskJson, loadVisibleTask, canManageTask, loadTaskOrder, canAccessTaskOrder, ensurePartyTaskDraft, canReadTask } from '@server/partyTasks'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { taskFailure } from '@helpers/partyTasks'

export const runtime = 'nodejs'
export const POST = withTaskContext(async (req, context) => {
  const maxBytes = 10 * 1024 * 1024
  if (!req.body || Number(req.headers.get('content-length') || 0) > maxBytes + 65536) taskFailure('Выберите фотографию до 10 МБ', 413)
  const reader = req.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes + 65536) { await reader.cancel(); taskFailure('Фотография должна быть меньше 10 МБ', 413) }
    chunks.push(Buffer.from(value))
  }
  const body = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData()
  const taskId = body.get('taskId') || null
  const draftKey = String(body.get('draftKey') || '')
  if (taskId) {
    const task = await loadVisibleTask(context, taskId)
    const order = await loadTaskOrder(context, task)
    if (!canManageTask(context) || !canAccessTaskOrder(context, order)) taskFailure('Нет права изменять описание задачи', 403)
    if (order && ['closed', 'canceled'].includes(order.status)) taskFailure('Задачи этого заказа нельзя изменять', 409)
  } else if (!/^[a-f\d-]{36}$/i.test(draftKey) || !canPartyAccess(context, { resource: 'tasks', action: 'create' })) taskFailure('Нет доступа к черновику задачи', 403)
  const file = body.get('file')
  if (!file || !file.size || file.size > maxBytes || typeof file.arrayBuffer !== 'function') taskFailure('Выберите фотографию до 10 МБ', 413)
  const mimeByFormat = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  if (!Object.values(mimeByFormat).includes(file.type)) taskFailure('Допустимы JPEG, PNG и WebP')
  let bytes
  try {
    const pipeline = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40000000, animated: false })
    const metadata = await pipeline.metadata()
    if (mimeByFormat[metadata.format] !== file.type || (metadata.pages || 1) > 1) taskFailure('Формат содержимого не соответствует фотографии')
    bytes = await pipeline.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
  } catch (error) { if (error.status) throw error; taskFailure('Не удалось прочитать фотографию') }
  const Media = await getPartyTaskMediaModel()
  await Media.init()
  const filter = { tenantId: context.tenantId, ...(taskId ? { taskId } : { taskId: null, draftKey, uploadedByUserId: context.sessionUser._id }) }
  const saveMedia = async (session) => {
    if (await Media.countDocuments(filter).session(session) >= 40) taskFailure('Не более 40 фотографий в задаче')
    const [media] = await Media.create([{ tenantId: context.tenantId, taskId, draftKey, uploadedByUserId: context.sessionUser._id, size: bytes.length, bytes }], { session })
    return media
  }
  let media
  if (taskId) {
    media = await withPartyTaskSeriesMutation({ tenantId: context.tenantId, taskId, work: async ({ session, task, Tasks }) => {
      const order = await loadTaskOrder(context, task, session)
      if (!canReadTask(context, task, order) || !canManageTask(context) || !canAccessTaskOrder(context, order)) taskFailure('Нет права изменять описание задачи', 403)
      if (order) {
        const { getPartyOrderModel } = await import('@server/partyModels')
        const Orders = await getPartyOrderModel()
        const locked = await Orders.updateOne({ _id: order._id, tenantId: context.tenantId, status: { $in: ['draft', 'active'] } }, { $inc: { taskScheduleRevision: 1 } }, { session })
        if (!locked.matchedCount) taskFailure('Задачи этого заказа нельзя изменять', 409)
      }
      await Tasks.updateOne({ _id: task._id, tenantId: context.tenantId }, { $inc: { mediaRevision: 1 } }, { session })
      return saveMedia(session)
    } })
    if (!media) taskFailure('Задача не найдена', 404)
  } else {
    const { Drafts, filter: draftFilter } = await ensurePartyTaskDraft(context, draftKey)
    const session = await Drafts.db.startSession()
    try {
      media = await session.withTransaction(async () => {
        const draft = await Drafts.findOneAndUpdate(draftFilter, { $inc: { revision: 1 } }, { session, new: true }).lean()
        if (!draft || draft.taskId) taskFailure('Черновик уже сохранён. Откройте существующую задачу.', 409)
        return saveMedia(session)
      })
    } finally { await session.endSession() }
  }
  return taskJson({ id: String(media._id), url: `/api/party/task-media/${media._id}` })
})
