import { NextResponse } from 'next/server'
import { getPartyOrderModel, getPartyServiceModel } from '@server/partyModels'
import { validatePartyServiceBookingSettings } from '@server/partyOrderTypes'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const pickServicePatch = (body) => {
  const patch = {}

  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (typeof body.description === 'string') {
    patch.description = body.description.trim()
  }
  if (body.duration !== undefined) patch.duration = Number(body.duration || 0)
  if (typeof body.specialization === 'string') {
    patch.specialization = body.specialization
  }
  if (body.price !== undefined) patch.price = Number(body.price || 0)
  if (body.groupId !== undefined) patch.groupId = body.groupId || null
  if (body.status === 'active' || body.status === 'archived') {
    patch.status = body.status
  }

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
    return partyError(400, 'partycrm_invalid_service_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  let patch
  try { patch = { ...pickServicePatch(body), ...await validatePartyServiceBookingSettings(body, context.tenantId) } }
  catch (cause) { return partyError(cause.status || 400, cause.code || 'partycrm_service_invalid', cause.status ? cause.message : 'Проверьте настройки услуги', 'validation') }
  if (patch.title === '') {
    return partyError(
      400,
      'partycrm_service_title_required',
      'Укажите название услуги',
      'validation'
    )
  }

  const PartyServices = await getPartyServiceModel()
  const service = await PartyServices.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: patch },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  if (!service) {
    return partyError(404, 'partycrm_service_not_found', 'Услуга не найдена')
  }
  return NextResponse.json({ success: true, data: service }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_service_id', 'Некорректный id')
  }

  const PartyOrders = await getPartyOrderModel()
  const ordersCount = await PartyOrders.countDocuments({
    tenantId: context.tenantId,
    servicesIds: id,
  })
  if (ordersCount > 0) {
    return partyError(
      400,
      'partycrm_service_in_use',
      'Услуга используется в заказах, удаление запрещено',
      'validation'
    )
  }

  const PartyServices = await getPartyServiceModel()
  const service = await PartyServices.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status: 'archived' } },
    { returnDocument: 'after' }
  ).lean()

  if (!service) {
    return partyError(404, 'partycrm_service_not_found', 'Услуга не найдена')
  }

  return NextResponse.json({ success: true, data: service }, { status: 200 })
}
