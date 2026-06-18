import { NextResponse } from 'next/server'
import {
  getPartyOrderModel,
  getPartyServiceModel,
  getPartyServiceGroupModel,
} from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const pickPatch = (body) => {
  const patch = {}
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (body.order !== undefined) patch.order = Number(body.order || 0)
  return patch
}

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export const PUT = async (req, { params }) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(
      400,
      'partycrm_invalid_service_group_id',
      'Некорректный id'
    )
  }

  const patch = pickPatch(await parseJsonBody(req))
  if (patch.title === '') {
    return partyError(
      400,
      'partycrm_service_group_title_required',
      'Укажите название группы',
      'validation'
    )
  }

  const PartyServiceGroups = await getPartyServiceGroupModel()
  const group = await PartyServiceGroups.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: patch },
    { returnDocument: 'after' }
  ).lean()
  if (!group) {
    return partyError(
      404,
      'partycrm_service_group_not_found',
      'Группа не найдена'
    )
  }
  return NextResponse.json({ success: true, data: group }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(
      400,
      'partycrm_invalid_service_group_id',
      'Некорректный id'
    )
  }

  // Проверяем, есть ли услуги в этой группе
  const PartyServices = await getPartyServiceModel()
  const servicesCount = await PartyServices.countDocuments({
    tenantId: context.tenantId,
    groupId: id,
  })
  if (servicesCount > 0) {
    return partyError(
      400,
      'partycrm_service_group_in_use',
      `Нельзя удалить группу: в ней ${servicesCount} услуг`,
      'validation'
    )
  }

  const PartyServiceGroups = await getPartyServiceGroupModel()
  const group = await PartyServiceGroups.findOneAndDelete({
    _id: id,
    tenantId: context.tenantId,
  }).lean()
  if (!group) {
    return partyError(
      404,
      'partycrm_service_group_not_found',
      'Группа не найдена'
    )
  }
  return NextResponse.json({ success: true, data: group }, { status: 200 })
}
