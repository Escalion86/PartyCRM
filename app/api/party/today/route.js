import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError, isValidObjectId, parseJsonBody } from '@server/partyApi'
import { loadPartyToday } from '@server/partyToday'
import { getPartyStaffModel } from '@server/partyModels'
import { getPartyTodayAccess, isValidPartyTodayWidgetIds, normalizePartyTodayWidgetIds } from '@helpers/partyToday'

export const dynamic = 'force-dynamic'

const canCustomizeWidgets = (context) =>
  !context.staff?.isDeveloperAccess && isValidObjectId(context.staff?._id)

export async function GET(req) {
  try {
    const { context, error } = await getPartyRequestContext({
      req,
      allowLocationOwner: true,
    })
    if (error) return error
    const data = await loadPartyToday({ context })
    return NextResponse.json(
      { success: true, data: {
        ...data,
        widgetIds: normalizePartyTodayWidgetIds(context.staff?.todayWidgetIds, context),
        canCustomizeWidgets: canCustomizeWidgets(context),
      } },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (failure) {
    const status = failure.status || 500
    return partyError(
      status,
      failure.code || 'partycrm_today_failed',
      status < 500 ? failure.message : 'Не удалось загрузить рабочий экран',
      status === 403 ? 'permission' : 'server'
    )
  }
}

export async function PATCH(req) {
  try {
    const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
    if (error) return error
    const access = getPartyTodayAccess(context)
    if (!Object.values(access).some(Boolean))
      return partyError(403, 'partycrm_today_forbidden', 'Нет доступа к рабочему экрану', 'permission')
    if (!canCustomizeWidgets(context))
      return partyError(409, 'partycrm_today_preferences_membership_required', 'Персональные блоки можно сохранить в своём кабинете сотрудника', 'validation')
    const body = await parseJsonBody(req)
    if (!Object.hasOwn(body, 'widgetIds') || !isValidPartyTodayWidgetIds(body.widgetIds))
      return partyError(400, 'partycrm_today_widgets_invalid', 'Выберите известные блоки без повторений или сбросьте настройку', 'validation')
    if (body.widgetIds?.some((key) => !access[key]))
      return partyError(403, 'partycrm_today_widgets_forbidden', 'Некоторые выбранные блоки недоступны вашей должности', 'permission')
    const widgetIds = normalizePartyTodayWidgetIds(body.widgetIds, context)
    const Staff = await getPartyStaffModel()
    const saved = await Staff.findOneAndUpdate(
      { _id: context.staff._id, tenantId: context.tenantId, status: 'active' },
      { $set: { todayWidgetIds: widgetIds } },
      { new: true, runValidators: true }
    ).select('todayWidgetIds').lean()
    if (!saved)
      return partyError(409, 'partycrm_today_preferences_membership_required', 'Участие в компании изменилось. Обновите рабочий экран.', 'validation')
    return NextResponse.json(
      { success: true, data: { widgetIds: normalizePartyTodayWidgetIds(saved.todayWidgetIds, context) } },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch {
    return partyError(500, 'partycrm_today_preferences_failed', 'Не удалось сохранить блоки рабочего экрана')
  }
}
