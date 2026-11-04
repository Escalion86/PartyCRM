import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { getPartyCompanyModel } from '@server/partyModels'
import { parsePartyWorkingSchedule } from '@helpers/partyWorkingSchedule'

export const dynamic = 'force-dynamic'
export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  return NextResponse.json({
    success: true,
    data: {
      schedule: context.company.settings?.workingSchedule || null,
      timeZone: context.company.settings?.timeZone || 'Asia/Krasnoyarsk',
      revision: context.company.settings?.bookingScheduleRevision || 0,
    },
  })
}
export async function PUT(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  try {
    const body = await parseJsonBody(req)
    if (
      !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0
    )
      return partyError(
        400,
        'partycrm_schedule_revision_required',
        'Обновите график перед сохранением'
      )
    const schedule = parsePartyWorkingSchedule(body.schedule)
    const Companies = await getPartyCompanyModel()
    const revision = body.expectedRevision
    const data = await Companies.findOneAndUpdate(
      {
        _id: context.tenantId,
        ...(revision === 0
          ? {
              $or: [
                { 'settings.bookingScheduleRevision': 0 },
                { 'settings.bookingScheduleRevision': { $exists: false } },
              ],
            }
          : { 'settings.bookingScheduleRevision': revision }),
      },
      {
        $set: { 'settings.workingSchedule': schedule },
        $inc: { 'settings.bookingScheduleRevision': 1 },
      },
      { returnDocument: 'after' }
    ).lean()
    if (!data)
      return partyError(
        409,
        'partycrm_schedule_changed',
        'График уже изменился. Загрузите его заново.'
      )
    return NextResponse.json({
      success: true,
      data: { schedule, revision: revision + 1 },
    })
  } catch (cause) {
    return partyError(
      cause.status || 500,
      cause.code || 'partycrm_schedule_failed',
      cause.status ? cause.message : 'Не удалось сохранить рабочий график'
    )
  }
}
