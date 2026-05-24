import { NextResponse } from 'next/server'
import { getPartyLocationModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const normalizeLocationPayload = (body) => ({
  title: typeof body.title === 'string' ? body.title.trim() : '',
  address: {
    town: typeof body.address?.town === 'string' ? body.address.town.trim() : '',
    street:
      typeof body.address?.street === 'string' ? body.address.street.trim() : '',
    house:
      typeof body.address?.house === 'string' ? body.address.house.trim() : '',
    room: typeof body.address?.room === 'string' ? body.address.room.trim() : '',
    comment:
      typeof body.address?.comment === 'string'
        ? body.address.comment.trim()
        : '',
  },
  status: ['active', 'paused', 'archived'].includes(body.status)
    ? body.status
    : 'active',
  bookingEnabled:
    typeof body.bookingEnabled === 'boolean' ? body.bookingEnabled : true,
  capacity:
    body.capacity === null || body.capacity === ''
      ? null
      : Number.isFinite(Number(body.capacity))
        ? Math.max(0, Math.floor(Number(body.capacity)))
        : null,
})

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const status = req.nextUrl.searchParams.get('status')
  const statusFilter =
    status === 'archived' ? { status: 'archived' } : { status: { $ne: 'archived' } }

  const PartyLocations = await getPartyLocationModel()
  const locations = await PartyLocations.find({
    tenantId: context.tenantId,
    ...statusFilter,
  })
    .sort({ title: 1, createdAt: 1 })
    .lean()

  return NextResponse.json({ success: true, data: locations })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizeLocationPayload(body)

  if (!payload.title) {
    return partyError(
      400,
      'partycrm_location_title_required',
      'Укажите название точки',
      'validation'
    )
  }

  const PartyLocations = await getPartyLocationModel()
  const location = await PartyLocations.create({
    ...payload,
    tenantId: context.tenantId,
  })

  return NextResponse.json({ success: true, data: location }, { status: 201 })
}
