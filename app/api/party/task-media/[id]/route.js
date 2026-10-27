import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { resolvePartyRequestContext } from '@server/partyApiCore'
import { partyError, isValidObjectId } from '@server/partyApi'
import { getPartyTaskMediaModel, getPartyTaskModel } from '@server/partyTaskModels'
import { canReadTask, loadTaskOrder, canAccessTaskOrder, taskAssignmentFilter, canManageTask, taskMediaIds } from '@server/partyTasks'
import { canPartyAccess } from '@helpers/partyRolePermissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_req, { params }) {
  const denied = () => partyError(404, 'partycrm_task_media_not_found', 'Фотография не найдена')
  try {
    const { id } = await params
    if (!isValidObjectId(id)) return denied()
    const membershipContext = await getPartyMembershipContext()
    if (!membershipContext.sessionUser?._id) return denied()
    const Media = await getPartyTaskMediaModel()
    const media = await Media.findOne({ _id: id }).lean()
    if (!media) return denied()
    const { context, error } = resolvePartyRequestContext({ membershipContext, requestedCompanyId: String(media.tenantId), allowLocationOwner: true })
    if (error || !canPartyAccess(context, { resource: 'tasks' })) return denied()
    if (!media.taskId) {
      if (String(media.uploadedByUserId) !== String(context.sessionUser._id) || !canPartyAccess(context, { resource: 'tasks', action: 'create' })) return denied()
    } else {
      const Tasks = await getPartyTaskModel()
      const candidates = await Tasks.find({ tenantId: context.tenantId, $and: [
        { $or: [{ _id: media.taskId }, { seriesId: media.taskId }, { mediaSourceTaskId: media.taskId }] },
        ...(canManageTask(context) ? [] : [taskAssignmentFilter(context)]),
      ] }).limit(100).lean()
      let allowed = false
      for (const task of candidates) {
        const order = await loadTaskOrder(context, task)
        if (!canReadTask(context, task, order)) continue
        const referenced = taskMediaIds(task.descriptionHtml).includes(String(media._id))
        const ownUploadPreview = String(task._id) === String(media.taskId) && String(media.uploadedByUserId) === String(context.sessionUser._id) && canManageTask(context)
        if (!referenced && !ownUploadPreview) continue
        if ((!task.orderId || order) && canAccessTaskOrder(context, order)) { allowed = true; break }
      }
      if (!allowed) return denied()
    }
    const stored = await Media.findOne({ _id: media._id, tenantId: context.tenantId }).select('+bytes').lean()
    const raw = stored?.bytes
    const bytes = Buffer.isBuffer(raw) ? raw : raw?.value ? raw.value(true) : raw?.buffer
    if (!bytes) return denied()
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'Content-Type': 'image/webp', 'Content-Length': String(media.size), 'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="task-photo.webp"', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
    } })
  } catch { return denied() }
}
