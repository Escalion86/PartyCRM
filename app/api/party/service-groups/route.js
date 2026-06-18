import { NextResponse } from 'next/server'
import { getPartyServiceGroupModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const normalizePayload = (body) => ({
  title: typeof body.title === 'string' ? body.title.trim() : '',
  order: Number(body.order || 0),
})

export const GET = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyServiceGroups = await getPartyServiceGroupModel()
  const groups = await PartyServiceGroups.find({
    tenantId: context.tenantId,
  })
    .sort({ order: 1, title: 1 })
    .lean()
  return NextResponse.json({ success: true, data: groups }, { status: 200 })
}

export const POST = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const payload = normalizePayload(await parseJsonBody(req))
  if (!payload.title) {
    return partyError(
      400,
      'partycrm_service_group_title_required',
      'Укажите название группы',
      'validation'
    )
  }

  const PartyServiceGroups = await getPartyServiceGroupModel()
  const group = await PartyServiceGroups.create({
    ...payload,
    tenantId: context.tenantId,
  })
  return NextResponse.json({ success: true, data: group }, { status: 201 })
}
