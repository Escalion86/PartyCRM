import { getPartyTaskModel } from '@server/partyTaskModels'
import { getPartyStaffModel } from '@server/partyModels'
import { withTaskContext, taskJson, loadVisibleTask, loadTaskOrder, serializeTask, updatePartyTaskForContext } from '@server/partyTasks'

export const dynamic = 'force-dynamic'

const responseTask = async (context, task) => {
  const Tasks = await getPartyTaskModel()
  const seriesRoot = task.seriesId ? await Tasks.findOne({ _id: task.seriesId, tenantId: context.tenantId }).lean() : null
  const Staff = await getPartyStaffModel()
  const ids = [...new Set([...(task.assigneeStaffIds || []), task.completedByStaffId].filter(Boolean).map(String))]
  const people = ids.length ? await Staff.find({ tenantId: context.tenantId, _id: { $in: ids } }).select('_id firstName secondName status').lean() : []
  const name = (person) => [person.firstName, person.secondName].filter(Boolean).join(' ') || 'Сотрудник'
  const staffById = new Map(people.filter((person) => person.status === 'active').map((person) => [String(person._id), name(person)]))
  const result = serializeTask(context, task, { order: await loadTaskOrder(context, task), seriesRoot, staffById })
  // Archived completion actors remain part of task history, while only active
  // assignees count as available. A restricted order must retain its safe stub.
  const completed = !result.blockedReason && people.find((person) => String(person._id) === String(task.completedByStaffId))
  return { ...result, completedByName: completed ? name(completed) : '' }
}

export const GET = withTaskContext(async (_req, context, { params }) => taskJson(await responseTask(context, await loadVisibleTask(context, (await params).id))))

export const PATCH = withTaskContext(async (req, context, { params }) => {
  const updated = await updatePartyTaskForContext(context, (await params).id, await req.json())
  return taskJson(updated.previewToken ? updated : await responseTask(context, updated))
})
