import { NextResponse } from 'next/server'
import { getPartyServiceModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const normalizeServicePayload = (body) => ({
  title: typeof body.title === 'string' ? body.title.trim() : '',
  description:
    typeof body.description === 'string' ? body.description.trim() : '',
  duration: Number(body.duration || 0),
  specialization:
    typeof body.specialization === 'string' ? body.specialization : 'other',
  price: Number(body.price || 0),
  status: body.status === 'archived' ? 'archived' : 'active',
})

export const GET = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const status = req.nextUrl.searchParams.get('status')
  const statusFilter =
    status === 'archived'
      ? { status: 'archived' }
      : { status: { $ne: 'archived' } }

  const PartyServices = await getPartyServiceModel()
  const services = await PartyServices.find({
    tenantId: context.tenantId,
    ...statusFilter,
  })
    .sort({ title: 1 })
    .lean()
  return NextResponse.json({ success: true, data: services }, { status: 200 })
}

export const POST = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const payload = normalizeServicePayload(await parseJsonBody(req))
  if (!payload.title) {
    return partyError(
      400,
      'partycrm_service_title_required',
      'Укажите название услуги',
      'validation'
    )
  }

  const PartyServices = await getPartyServiceModel()
  const service = await PartyServices.create({
    ...payload,
    tenantId: context.tenantId,
  })
  return NextResponse.json({ success: true, data: service }, { status: 201 })
}
