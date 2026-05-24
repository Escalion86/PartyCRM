import { NextResponse } from 'next/server'
import { getPartyStaffModel } from '@server/partyModels'
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
  if (['owner', 'admin', 'performer'].includes(body.role)) patch.role = body.role
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

const ensureNotLastOwner = async ({ PartyStaff, tenantId, staffId, patch }) => {
  const affectsOwner =
    patch.status === 'archived' || (patch.role && patch.role !== 'owner')
  if (!affectsOwner) return null

  const target = await PartyStaff.findOne({ _id: staffId, tenantId }).lean()
  if (target?.role !== 'owner') return null

  const ownersCount = await PartyStaff.countDocuments({
    tenantId,
    role: 'owner',
    status: { $ne: 'archived' },
    _id: { $ne: staffId },
  })

  return ownersCount > 0
    ? null
    : partyError(
        400,
        'partycrm_last_owner_required',
        'Нельзя удалить или понизить последнего владельца',
        'validation'
      )
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

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const patch = pickStaffPatch(body)
  const PartyStaff = await getPartyStaffModel()
  const ownerError = await ensureNotLastOwner({
    PartyStaff,
    tenantId: context.tenantId,
    staffId: id,
    patch,
  })
  if (ownerError) return ownerError

  const staff = await PartyStaff.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: patch },
    { returnDocument: 'after' }
  ).lean()

  if (!staff) {
    return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')
  }

  return NextResponse.json({ success: true, data: staff })
}

export async function DELETE(req, { params }) {
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
  const ownerError = await ensureNotLastOwner({
    PartyStaff,
    tenantId: context.tenantId,
    staffId: id,
    patch: { status: 'archived' },
  })
  if (ownerError) return ownerError

  const staff = await PartyStaff.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status: 'archived' } },
    { returnDocument: 'after' }
  ).lean()

  if (!staff) {
    return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')
  }

  return NextResponse.json({ success: true, data: staff })
}
