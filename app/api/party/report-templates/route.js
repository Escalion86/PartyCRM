import mongoose from 'mongoose'
import { getPartyReportTemplateModel } from '@server/partyReportModels'
import { latestReportTemplates, reportId, reportJson, validateReportFields, withReportContext } from '@server/partyReportAccess'
import { reportFailure } from '@server/partyReportCore'

export const dynamic = 'force-dynamic'

export const GET = withReportContext(async (_req, context) => reportJson(await latestReportTemplates(context.tenantId)), true)

export const POST = withReportContext(async (req, context) => {
  const body = await req.json()
  const title = String(body.title || '').trim()
  if (!title || title.length > 180 || !['before', 'after'].includes(body.stage)) reportFailure('Укажите название и этап формы')
  const fields = await validateReportFields(context.tenantId, body.fields)
  const Templates = await getPartyReportTemplateModel()
  let familyId = new mongoose.Types.ObjectId()
  let version = 1
  if (body.previousTemplateId) {
    const previous = await Templates.findOne({ _id: reportId(body.previousTemplateId), tenantId: context.tenantId }).lean()
    if (!previous) reportFailure('Предыдущая версия не найдена', 404)
    const latest = await Templates.findOne({ tenantId: context.tenantId, familyId: previous.familyId }).sort({ version: -1 }).lean()
    if (String(latest._id) !== String(previous._id)) reportFailure('Форма уже изменена. Загрузите последнюю версию.', 409)
    if (previous.stage !== body.stage) reportFailure('Этап опубликованной формы изменить нельзя; создайте новую форму')
    familyId = previous.familyId
    version = previous.version + 1
  }
  const template = await Templates.create({ tenantId: context.tenantId, familyId, version, title, stage: body.stage, active: body.active !== false, fields })
  return reportJson(template.toObject())
}, true)
