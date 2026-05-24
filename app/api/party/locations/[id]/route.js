import { NextResponse } from 'next/server'
import { getPartyLocationModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const pickLocationPatch = (body) => {
  const patch = {}

  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (['active', 'paused', 'archived'].includes(body.status)) {
    patch.status = body.status
  }
  if (typeof body.bookingEnabled === 'boolean') {
    patch.bookingEnabled = body.bookingEnabled
  }
  if (body.capacity !== undefined) {
    patch.capacity =
      body.capacity === null || body.capacity === ''
        ? null
        : Number.isFinite(Number(body.capacity))
          ? Math.max(0, Math.floor(Number(body.capacity)))
          : null
  }

  if (body.address && typeof body.address === 'object') {
    for (const field of ['town', 'street', 'house', 'room', 'comment']) {
      if (typeof body.address[field] === 'string') {
        patch[`address.${field}`] = body.address[field].trim()
      }
    }
  }

  return patch
}

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_location_id', 'Некорректный id')
  }

  const PartyLocations = await getPartyLocationModel()
  const location = await PartyLocations.findOne({
    _id: id,
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!location) {
    return partyError(404, 'partycrm_location_not_found', 'Точка не найдена')
  }

  return NextResponse.json({ success: true, data: location })
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_location_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const patch = pickLocationPatch(body)

  if (patch.title === '') {
    return partyError(
      400,
      'partycrm_location_title_required',
      'Укажите название точки',
      'validation'
    )
  }

  const PartyLocations = await getPartyLocationModel()
  const location = await PartyLocations.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: patch },
    { returnDocument: 'after' }
  ).lean()

  if (!location) {
    return partyError(404, 'partycrm_location_not_found', 'Точка не найдена')
  }

  return NextResponse.json({ success: true, data: location })
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_location_id', 'Некорректный id')
  }

  const PartyLocations = await getPartyLocationModel()
  const location = await PartyLocations.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status: 'archived' } },
    { returnDocument: 'after' }
  ).lean()

  if (!location) {
    return partyError(404, 'partycrm_location_not_found', 'Точка не найдена')
  }

  return NextResponse.json({ success: true, data: location })
}
