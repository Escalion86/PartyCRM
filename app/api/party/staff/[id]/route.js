import { NextResponse } from 'next/server'
import { getPartyStaffModel } from '@server/partyModels'
import { validateStaffLocationScope } from '@server/partyLocationAccess'
import { getPartyStaffPositionPatch } from '@server/partyRoles'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { withPartyStaffMutationLock } from '@server/partyStaffMutation'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const normalizeEmail = (email) => {
  if (!email) return ''
  return String(email).trim().toLowerCase()
}

const normalizeText = (value, maxLength = 160) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const pickStaffPatch = (body) => {
  const patch = {}

  if (typeof body.firstName === 'string') {
    patch.firstName = normalizeText(body.firstName, 100)
  }
  if (typeof body.secondName === 'string') {
    patch.secondName = normalizeText(body.secondName, 100)
  }
  if (body.phone !== undefined) patch.phone = normalizePhone(body.phone)
  if (body.email !== undefined) patch.email = normalizeEmail(body.email)
  if (
    [
      '',
      'animator',
      'magician',
      'host',
      'photographer',
      'workshop',
      'other',
    ].includes(body.specialization)
  ) {
    patch.specialization = body.specialization
  }
  if (typeof body.description === 'string') {
    patch.description = normalizeText(body.description, 1000)
  }
  if (['owner', 'admin', 'performer', 'location_owner'].includes(body.role))
    patch.role = body.role
  if (['active', 'invited', 'paused', 'archived'].includes(body.status)) {
    patch.status = body.status
  }
  if (typeof body.visibleToPerformer === 'boolean') {
    patch.visibleToPerformer = body.visibleToPerformer
  }

  return patch
}

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

const ensureNotLastOwner = async ({
  PartyStaff,
  tenantId,
  staffId,
  patch,
  session,
}) => {
  const affectsOwner =
    (patch.status && patch.status !== 'active') ||
    (patch.role && patch.role !== 'owner')
  if (!affectsOwner) return null

  const target = await PartyStaff.findOne({ _id: staffId, tenantId })
    .session(session)
    .lean()
  if (target?.role !== 'owner') return null

  const ownersCount = await PartyStaff.countDocuments({
    tenantId,
    role: 'owner',
    status: 'active',
    _id: { $ne: staffId },
  }).session(session)

  return ownersCount > 0
    ? null
    : partyError(
        400,
        'partycrm_last_owner_required',
        'Нельзя удалить или понизить последнего владельца',
        'validation'
      )
}

// Проверяет, что цель не является владельцем (владельца удалять нельзя)
const ensureNotOwner = async ({ PartyStaff, tenantId, staffId, session }) => {
  const target = await PartyStaff.findOne({ _id: staffId, tenantId })
    .session(session)
    .lean()
  if (target?.role === 'owner') {
    return partyError(
      400,
      'partycrm_cannot_delete_owner',
      'Нельзя удалить владельца компании',
      'validation'
    )
  }
  return null
}

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const PartyStaff = await getPartyStaffModel()
  const staff = await PartyStaff.findOne({
    _id: id,
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!staff) {
    return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')
  }

  return NextResponse.json({ success: true, data: staff })
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  if (!canPartyAccess(context, { resource: 'staff', action: 'edit' }))
    return partyError(
      403,
      'partycrm_forbidden',
      'Нет права изменять сотрудников',
      'permission'
    )

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  try {
    return await withPartyStaffMutationLock({
      context,
      work: async ({ session }) => {
        const patch = pickStaffPatch(body)
        const PartyStaff = await getPartyStaffModel()

        // Передача прав владельца — только текущий владелец может назначить нового
        const currentStaff = await PartyStaff.findOne({
          _id: id,
          tenantId: context.tenantId,
        })
          .session(session)
          .lean()
        if (!currentStaff)
          return partyError(
            404,
            'partycrm_staff_not_found',
            'Сотрудник не найден'
          )
        if (Object.hasOwn(body, 'positionId')) {
          try {
            Object.assign(
              patch,
              await getPartyStaffPositionPatch({
                context,
                positionId: body.positionId,
                targetStaff: currentStaff,
              })
            )
          } catch (failure) {
            return partyError(
              failure.status || 500,
              failure.code || 'partycrm_invalid_position',
              failure.status
                ? failure.message
                : 'Не удалось проверить должность',
              'permission'
            )
          }
        } else if (patch.role && patch.role !== currentStaff.role)
          patch.positionId = null
        if (
          context.role !== 'owner' &&
          (currentStaff.role === 'owner' ||
            (String(currentStaff._id) === String(context.staff._id) &&
              ((patch.role && patch.role !== currentStaff.role) ||
                (Object.hasOwn(patch, 'positionId') &&
                  String(patch.positionId || '') !==
                    String(currentStaff.positionId || '')))))
        )
          return partyError(
            403,
            'partycrm_self_position_change',
            'Свою должность или владельца может изменить только владелец',
            'permission'
          )
        if ((patch.role || currentStaff.role) === 'location_owner') {
          try {
            patch.locationIds = await validateStaffLocationScope(
              context.tenantId,
              body.locationIds ?? currentStaff.locationIds
            )
          } catch (failure) {
            return partyError(
              failure.status || 400,
              'partycrm_invalid_location_scope',
              failure.status
                ? failure.message
                : 'Не удалось проверить площадки',
              'validation'
            )
          }
        } else if (patch.role) patch.locationIds = []
        let previousOwnerData = null
        let ownerToDemoteId = null
        const ownerError = await ensureNotLastOwner({
          PartyStaff,
          tenantId: context.tenantId,
          staffId: id,
          patch,
          session,
        })
        if (ownerError) return ownerError
        if (patch.role === 'owner') {
          if (context.role !== 'owner') {
            return partyError(
              403,
              'partycrm_only_owner_can_transfer',
              'Только владелец может передать права владельца',
              'permission'
            )
          }

          // Нельзя назначить владельцем подрядчика без привязанного аккаунта
          const targetStaff = await PartyStaff.findOne({
            _id: id,
            tenantId: context.tenantId,
          })
            .session(session)
            .lean()
          if (!targetStaff) {
            return partyError(
              404,
              'partycrm_staff_not_found',
              'Сотрудник не найден'
            )
          }
          if (!targetStaff.authUserId) {
            return partyError(
              400,
              'partycrm_owner_requires_account',
              'Нельзя назначить владельцем подрядчика без привязанного аккаунта. Сначала привяжите аккаунт.',
              'validation'
            )
          }

          // First persist the new owner. A failed target write must never leave no owner.
          const currentOwnerStaffId = context.staff?._id
          if (
            isValidObjectId(currentOwnerStaffId) &&
            String(currentOwnerStaffId) !== String(id)
          ) {
            ownerToDemoteId = currentOwnerStaffId
          }
        }

        const staff = await PartyStaff.findOneAndUpdate(
          { _id: id, tenantId: context.tenantId },
          { $set: patch },
          { returnDocument: 'after', runValidators: true, session }
        ).lean()

        if (!staff) {
          return partyError(
            404,
            'partycrm_staff_not_found',
            'Сотрудник не найден'
          )
        }

        if (
          ownerToDemoteId &&
          staff.role === 'owner' &&
          staff.status === 'active'
        ) {
          const demotedOwner = await PartyStaff.findOneAndUpdate(
            { _id: ownerToDemoteId, tenantId: context.tenantId, role: 'owner' },
            { $set: { role: 'admin', positionId: null } },
            { returnDocument: 'after', session }
          ).lean()
          if (demotedOwner)
            previousOwnerData = {
              _id: demotedOwner._id,
              role: demotedOwner.role,
            }
        }

        const responsePayload = { success: true, data: staff }
        if (previousOwnerData) {
          responsePayload.previousOwner = previousOwnerData
        }

        return NextResponse.json(responsePayload)
      },
    })
  } catch (failure) {
    return partyError(
      failure.status || 500,
      failure.code || 'partycrm_staff_update_failed',
      failure.status ? failure.message : 'Не удалось изменить сотрудника',
      failure.status === 403 ? 'permission' : 'server'
    )
  }
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  if (!canPartyAccess(context, { resource: 'staff', action: 'edit' }))
    return partyError(
      403,
      'partycrm_forbidden',
      'Нет права изменять сотрудников',
      'permission'
    )

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const PartyStaff = await getPartyStaffModel()

  try {
    return await withPartyStaffMutationLock({
      context,
      work: async ({ session }) => {
        // Владельца удалить нельзя
        const ownerCheckError = await ensureNotOwner({
          PartyStaff,
          tenantId: context.tenantId,
          staffId: id,
          session,
        })
        if (ownerCheckError) return ownerCheckError

        const ownerError = await ensureNotLastOwner({
          PartyStaff,
          tenantId: context.tenantId,
          staffId: id,
          patch: { status: 'archived' },
          session,
        })
        if (ownerError) return ownerError

        const staff = await PartyStaff.findOneAndUpdate(
          { _id: id, tenantId: context.tenantId },
          { $set: { status: 'archived' } },
          { returnDocument: 'after', session }
        ).lean()

        if (!staff) {
          return partyError(
            404,
            'partycrm_staff_not_found',
            'Сотрудник не найден'
          )
        }

        return NextResponse.json({ success: true, data: staff })
      },
    })
  } catch (failure) {
    return partyError(
      failure.status || 500,
      failure.code || 'partycrm_staff_delete_failed',
      failure.status ? failure.message : 'Не удалось архивировать сотрудника',
      failure.status === 403 ? 'permission' : 'server'
    )
  }
}
