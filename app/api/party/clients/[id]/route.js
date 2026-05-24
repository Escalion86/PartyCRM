import { NextResponse } from 'next/server'
import { getPartyClientModel, getPartyOrderModel } from '@server/partyModels'
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

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeSignificantDates = (items) => {
  if (!Array.isArray(items)) return undefined
  return items
    .map((item) => ({
      title: normalizeString(item?.title),
      date: item?.date ? new Date(item.date) : null,
      comment: normalizeString(item?.comment),
    }))
    .filter(
      (item) =>
        item.title || item.comment || (item.date && !Number.isNaN(item.date.getTime()))
    )
}

const pickClientPatch = (body) => {
  const patch = {}

  if (typeof body.firstName === 'string') patch.firstName = normalizeString(body.firstName)
  if (typeof body.secondName === 'string') patch.secondName = normalizeString(body.secondName)
  if (typeof body.thirdName === 'string') patch.thirdName = normalizeString(body.thirdName)
  if (body.phone !== undefined) patch.phone = normalizePhone(body.phone)
  if (body.whatsapp !== undefined) patch.whatsapp = normalizePhone(body.whatsapp)
  if (body.viber !== undefined) patch.viber = normalizePhone(body.viber)
  if (typeof body.telegram === 'string') patch.telegram = normalizeString(body.telegram)
  if (typeof body.instagram === 'string') patch.instagram = normalizeString(body.instagram)
  if (typeof body.vk === 'string') patch.vk = normalizeString(body.vk)
  if (typeof body.preferredContactChannel === 'string') {
    patch.preferredContactChannel = ['phone', 'telegram', 'whatsapp', 'max', 'vk', 'other', ''].includes(
      body.preferredContactChannel
    )
      ? body.preferredContactChannel
      : ''
  }
  if (typeof body.preferredContactChannelOther === 'string') {
    patch.preferredContactChannelOther = normalizeString(body.preferredContactChannelOther)
  }
  if (typeof body.email === 'string') patch.email = body.email.trim().toLowerCase()
  if (typeof body.town === 'string') patch.town = normalizeString(body.town)
  if (typeof body.legalName === 'string') patch.legalName = normalizeString(body.legalName)
  if (typeof body.inn === 'string') patch.inn = normalizeString(body.inn)
  if (typeof body.kpp === 'string') patch.kpp = normalizeString(body.kpp)
  if (typeof body.ogrn === 'string') patch.ogrn = normalizeString(body.ogrn)
  if (typeof body.bankName === 'string') patch.bankName = normalizeString(body.bankName)
  if (typeof body.bik === 'string') patch.bik = normalizeString(body.bik)
  if (typeof body.checkingAccount === 'string') patch.checkingAccount = normalizeString(body.checkingAccount)
  if (typeof body.correspondentAccount === 'string') {
    patch.correspondentAccount = normalizeString(body.correspondentAccount)
  }
  if (typeof body.legalAddress === 'string') patch.legalAddress = normalizeString(body.legalAddress)
  if (typeof body.comment === 'string') patch.comment = normalizeString(body.comment)
  if (body.significantDates !== undefined) {
    patch.significantDates = normalizeSignificantDates(body.significantDates) ?? []
  }
  if (body.status === 'active' || body.status === 'archived') {
    patch.status = body.status
  }

  return patch
}

const syncClientSnapshotInOrders = async ({ tenantId, clientId, client }) => {
  const PartyOrders = await getPartyOrderModel()
  await PartyOrders.updateMany(
    { tenantId, clientId },
    {
      $set: {
        client: {
          name: [client.firstName, client.secondName, client.thirdName]
            .filter(Boolean)
            .join(' '),
          phone: client.phone || '',
          email: client.email || '',
        },
      },
    }
  )
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
    return partyError(400, 'partycrm_invalid_client_id', 'Некорректный id')
  }

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.findOne({
    _id: id,
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!client) {
    return partyError(404, 'partycrm_client_not_found', 'Клиент не найден')
  }

  return NextResponse.json({ success: true, data: client })
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_client_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const patch = pickClientPatch(body)

  if (patch.firstName === '') {
    return partyError(
      400,
      'partycrm_client_first_name_required',
      'Укажите имя клиента',
      'validation'
    )
  }

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: patch },
    { returnDocument: 'after' }
  ).lean()

  if (!client) {
    return partyError(404, 'partycrm_client_not_found', 'Клиент не найден')
  }

  await syncClientSnapshotInOrders({
    tenantId: context.tenantId,
    clientId: client._id,
    client,
  })

  return NextResponse.json({ success: true, data: client })
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_client_id', 'Некорректный id')
  }

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status: 'archived' } },
    { returnDocument: 'after' }
  ).lean()

  if (!client) {
    return partyError(404, 'partycrm_client_not_found', 'Клиент не найден')
  }

  return NextResponse.json({ success: true, data: client })
}
