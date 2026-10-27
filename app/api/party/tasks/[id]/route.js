import { getPartyTaskModel } from '@server/partyTaskModels'
import { withTaskContext, taskJson, loadVisibleTask, loadTaskOrder, serializeTask, updatePartyTaskForContext } from '@server/partyTasks'

export const dynamic = 'force-dynamic'

const responseTask = async (context, task) => {
  const Tasks = await getPartyTaskModel()
  const seriesRoot = task.seriesId ? await Tasks.findOne({ _id: task.seriesId, tenantId: context.tenantId }).lean() : null
  return serializeTask(context, task, { order: await loadTaskOrder(context, task), seriesRoot })
}

export const GET = withTaskContext(async (_req, context, { params }) => taskJson(await responseTask(context, await loadVisibleTask(context, (await params).id))))

export const PATCH = withTaskContext(async (req, context, { params }) => {
  const updated = await updatePartyTaskForContext(context, (await params).id, await req.json())
  return taskJson(updated.previewToken ? updated : await responseTask(context, updated))
})
