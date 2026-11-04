import {
  invitationRoute,
  getPartyInvitationTemplateModel,
  normalizePartyInvitationContent,
} from '@server/partyInvitations'
import { partyBookingFailure } from '@helpers/partyOrderBooking'
import { canPartyAccess } from '@helpers/partyRolePermissions'

export const GET = invitationRoute(async ({ context }) => {
  if (!canPartyAccess(context, { resource: 'orders.title' }))
    partyBookingFailure('Нет доступа к шаблонам приглашений', 403)
  const Templates = await getPartyInvitationTemplateModel()
  return Templates.find({ tenantId: context.tenantId })
    .sort({ title: 1 })
    .lean()
})
export const POST = invitationRoute(async ({ context, body }) => {
  if (
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    body.title.length > 180
  )
    partyBookingFailure('Укажите название шаблона')
  const Templates = await getPartyInvitationTemplateModel()
  return Templates.create({
    tenantId: context.tenantId,
    title: body.title.trim(),
    content: normalizePartyInvitationContent(body.content),
  })
}, true)
export const PATCH = invitationRoute(async ({ context, body }) => {
  if (
    !/^[a-f\d]{24}$/i.test(String(body.id || '')) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    body.title.length > 180
  )
    partyBookingFailure('Обновите шаблон и укажите его название')
  const Templates = await getPartyInvitationTemplateModel()
  const record = await Templates.findOneAndUpdate(
    {
      _id: body.id,
      tenantId: context.tenantId,
      revision: body.expectedRevision,
    },
    {
      $set: {
        title: body.title.trim(),
        content: normalizePartyInvitationContent(body.content),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: 'after' }
  ).lean()
  if (!record) partyBookingFailure('Шаблон уже изменён. Обновите список.', 409)
  return record
}, true)
