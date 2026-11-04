import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
  isValidObjectId,
} from '@server/partyApi'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  getPartyOrderTypes,
  normalizePartyOrderTypeTitle,
} from '@server/partyOrderTypes'
import { getPartyOrderTypeModel } from '@server/partyModels'

export const dynamic = 'force-dynamic'
const failure = (cause) =>
  partyError(
    cause.code === 11000 ? 409 : cause.status || 500,
    cause.code === 11000
      ? 'partycrm_order_type_duplicate'
      : 'partycrm_order_type_failed',
    cause.code === 11000
      ? 'Такой тип заказа уже существует'
      : cause.status
        ? cause.message
        : 'Не удалось сохранить тип заказа'
  )
export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
  })
  if (error) return error
  if (
    !canPartyAccess(context, { resource: 'orders.title' }) &&
    !canPartyAccess(context, { resource: 'services' })
  )
    return partyError(403, 'partycrm_forbidden', 'Нет доступа к типам заказов')
  return NextResponse.json({
    success: true,
    data: await getPartyOrderTypes(context, {
      all:
        ['owner', 'admin'].includes(context.role) &&
        req.nextUrl.searchParams.get('all') === 'true',
    }),
  })
}
export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const body = await parseJsonBody(req)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 180)
    return partyError(
      400,
      'partycrm_order_type_invalid',
      'Укажите название типа до 180 символов'
    )
  try {
    const Types = await getPartyOrderTypeModel()
    const data = await Types.create({
      tenantId: context.tenantId,
      title,
      normalizedTitle: normalizePartyOrderTypeTitle(title),
    })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (cause) {
    return failure(cause)
  }
}
export async function PATCH(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const body = await parseJsonBody(req)
  if (!isValidObjectId(body.id) || !Number.isSafeInteger(body.expectedRevision))
    return partyError(
      400,
      'partycrm_order_type_invalid',
      'Обновите тип заказа и повторите изменение'
    )
  const patch = {}
  if (body.title !== undefined) {
    if (
      typeof body.title !== 'string' ||
      !body.title.trim() ||
      body.title.trim().length > 180
    )
      return partyError(
        400,
        'partycrm_order_type_invalid',
        'Укажите название типа до 180 символов'
      )
    patch.title = body.title.trim()
    patch.normalizedTitle = normalizePartyOrderTypeTitle(body.title)
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean')
      return partyError(
        400,
        'partycrm_order_type_invalid',
        'Проверьте состояние типа'
      )
    patch.active = body.active
  }
  if (body.invitationTemplateId !== undefined) {
    if (
      body.invitationTemplateId !== null &&
      !isValidObjectId(body.invitationTemplateId)
    )
      return partyError(
        400,
        'partycrm_order_type_invalid',
        'Выберите шаблон приглашения'
      )
    if (body.invitationTemplateId) {
      const { getPartyInvitationTemplateModel } =
        await import('@server/partyInvitations')
      const Templates = await getPartyInvitationTemplateModel()
      if (
        !(await Templates.exists({
          _id: body.invitationTemplateId,
          tenantId: context.tenantId,
        }))
      )
        return partyError(
          400,
          'partycrm_invitation_template_not_found',
          'Шаблон приглашения не найден'
        )
    }
    patch.invitationTemplateId = body.invitationTemplateId
  }
  try {
    const Types = await getPartyOrderTypeModel()
    const data = await Types.findOneAndUpdate(
      {
        _id: body.id,
        tenantId: context.tenantId,
        revision: body.expectedRevision,
      },
      { $set: patch, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean()
    if (!data)
      return partyError(
        409,
        'partycrm_order_type_changed',
        'Тип уже изменён. Обновите список.'
      )
    return NextResponse.json({ success: true, data })
  } catch (cause) {
    return failure(cause)
  }
}
