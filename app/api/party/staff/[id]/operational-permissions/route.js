import { NextResponse } from 'next/server'
import { getPartyStaffModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  PARTY_OPERATIONAL_PERMISSIONS,
  normalizePartyOperationalPermissions,
} from '@helpers/partyOperationalPermissions'

export const dynamic = 'force-dynamic'
const projection = '_id role status operationalPermissions permissionRevision'
const response = (staff) =>
  NextResponse.json({
    success: true,
    data: {
      staffId: String(staff._id),
      role: staff.role,
      status: staff.status,
      permissions: normalizePartyOperationalPermissions(
        staff.operationalPermissions
      ),
      revision: staff.permissionRevision ?? 0,
    },
  })
const route =
  (write) =>
  async (req, { params }) => {
    const { context, error } = await getPartyRequestContext({
      req,
      managementOnly: true,
    })
    if (error) return error
    const { id } = await params
    if (!isValidObjectId(id))
      return partyError(
        400,
        'partycrm_invalid_staff_id',
        'Некорректный id сотрудника',
        'validation'
      )
    try {
      const Staff = await getPartyStaffModel()
      const filter = { _id: id, tenantId: context.tenantId }
      const staff = await Staff.findOne(filter).select(projection).lean()
      if (!staff)
        return partyError(
          404,
          'partycrm_staff_not_found',
          'Сотрудник не найден',
          'validation'
        )
      if (!write) return response(staff)
      const body = await parseJsonBody(req)
      if (
        !body ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (key) => !['permissions', 'expectedRevision'].includes(key)
        ) ||
        !Array.isArray(body.permissions) ||
        body.permissions.some(
          (permission) => !PARTY_OPERATIONAL_PERMISSIONS.includes(permission)
        ) ||
        new Set(body.permissions).size !== body.permissions.length ||
        !Number.isSafeInteger(body.expectedRevision) ||
        body.expectedRevision < 0
      )
        return partyError(
          400,
          'partycrm_invalid_permissions',
          'Некорректные права или версия настроек',
          'validation'
        )
      if (staff.role !== 'performer')
        return partyError(
          400,
          'partycrm_permissions_role',
          'Отдельные права назначаются только исполнителю',
          'validation'
        )
      const revision = staff.permissionRevision ?? 0
      if (revision !== body.expectedRevision)
        return partyError(
          409,
          'partycrm_permissions_conflict',
          'Права уже изменены. Обновите данные',
          'conflict'
        )
      const updated = await Staff.findOneAndUpdate(
        {
          ...filter,
          role: staff.role,
          status: staff.status,
          ...(revision === 0
            ? {
                $or: [
                  { permissionRevision: 0 },
                  { permissionRevision: { $exists: false } },
                ],
              }
            : { permissionRevision: revision }),
        },
        {
          $set: { operationalPermissions: body.permissions },
          $inc: { permissionRevision: 1 },
        },
        { new: true, runValidators: true }
      )
        .select(projection)
        .lean()
      if (!updated)
        return partyError(
          409,
          'partycrm_permissions_conflict',
          'Сотрудник или права уже изменены. Обновите данные',
          'conflict'
        )
      return response(updated)
    } catch {
      return partyError(
        500,
        'partycrm_permissions_failed',
        'Не удалось обработать права сотрудника'
      )
    }
  }
export const GET = route(false)
export const PATCH = route(true)
