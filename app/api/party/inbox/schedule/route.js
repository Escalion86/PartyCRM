import { NextResponse } from 'next/server'
import { getPartyRequestContext, parseJsonBody, partyError } from '@server/partyApi'
import { getPartyCompanyModel } from '@server/partyModels'
import { defaultPartyInboxSchedule, parsePartyInboxSchedule } from '@helpers/partyInboxSchedule'

export const dynamic = 'force-dynamic'

const response = (company) => NextResponse.json({ success: true, data: {
  schedule: company.settings?.inboxSchedule || defaultPartyInboxSchedule(),
  revision: company.settings?.inboxScheduleRevision || 0,
  timeZone: company.settings?.timeZone || 'Asia/Krasnoyarsk',
} }, { headers: { 'Cache-Control': 'private, no-store' } })

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const Companies = await getPartyCompanyModel()
    const company = await Companies.findOne({ _id: context.tenantId })
      .select('settings.inboxSchedule settings.inboxScheduleRevision settings.timeZone').lean()
    if (!company) return partyError(404, 'company_not_found', 'Компания не найдена')
    return response(company)
  } catch {
    return partyError(500, 'inbox_schedule_load_failed', 'Не удалось загрузить график')
  }
}

export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const body = await parseJsonBody(req)
  let schedule
  try {
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
      throw new Error('Некорректная версия графика')
    }
    schedule = parsePartyInboxSchedule(body.schedule)
  } catch (error) {
    return partyError(400, 'invalid_inbox_schedule', error.message, 'validation')
  }
  try {
    const Companies = await getPartyCompanyModel()
    const revisionFilter = body.expectedRevision === 0
      ? { $or: [{ 'settings.inboxScheduleRevision': 0 }, { 'settings.inboxScheduleRevision': { $exists: false } }] }
      : { 'settings.inboxScheduleRevision': body.expectedRevision }
    const company = await Companies.findOneAndUpdate(
      { _id: context.tenantId, ...revisionFilter },
      { $set: { 'settings.inboxSchedule': schedule }, $inc: { 'settings.inboxScheduleRevision': 1 } },
      { new: true }
    ).select('settings.inboxSchedule settings.inboxScheduleRevision settings.timeZone').lean()
    if (!company) return partyError(409, 'inbox_schedule_conflict', 'График уже изменён. Обновите данные.', 'conflict')
    return response(company)
  } catch {
    return partyError(500, 'inbox_schedule_save_failed', 'Не удалось сохранить график')
  }
}
