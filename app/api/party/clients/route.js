import { NextResponse } from 'next/server'
import { getPartyClientModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeClientPayload = (body) => ({
  firstName: normalizeString(body.firstName),
  secondName: normalizeString(body.secondName),
  thirdName: normalizeString(body.thirdName),
  phone: normalizePhone(body.phone),
  whatsapp: normalizePhone(body.whatsapp),
  viber: normalizePhone(body.viber),
  telegram: normalizeString(body.telegram),
  instagram: normalizeString(body.instagram),
  vk: normalizeString(body.vk),
  preferredContactChannel: ['phone', 'telegram', 'whatsapp', 'max', 'vk', 'other', ''].includes(
    body.preferredContactChannel
  )
    ? body.preferredContactChannel
    : '',
  preferredContactChannelOther: normalizeString(body.preferredContactChannelOther),
  email:
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
  town: normalizeString(body.town),
  legalName: normalizeString(body.legalName),
  inn: normalizeString(body.inn),
  kpp: normalizeString(body.kpp),
  ogrn: normalizeString(body.ogrn),
  bankName: normalizeString(body.bankName),
  bik: normalizeString(body.bik),
  checkingAccount: normalizeString(body.checkingAccount),
  correspondentAccount: normalizeString(body.correspondentAccount),
  legalAddress: normalizeString(body.legalAddress),
  comment: normalizeString(body.comment),
  significantDates: Array.isArray(body.significantDates)
    ? body.significantDates
        .map((item) => ({
          title: normalizeString(item?.title),
          date: item?.date ? new Date(item.date) : null,
          comment: normalizeString(item?.comment),
        }))
        .filter(
          (item) =>
            item.title || item.comment || (item.date && !Number.isNaN(item.date.getTime()))
        )
    : [],
  status: body.status === 'archived' ? 'archived' : 'active',
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

  const PartyClients = await getPartyClientModel()
  const clients = await PartyClients.find({
    tenantId: context.tenantId,
    ...statusFilter,
  })
    .sort({ firstName: 1, secondName: 1, createdAt: -1 })
    .lean()

  return NextResponse.json({ success: true, data: clients })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizeClientPayload(body)

  if (!payload.firstName) {
    return partyError(
      400,
      'partycrm_client_first_name_required',
      'Укажите имя клиента',
      'validation'
    )
  }

  const PartyClients = await getPartyClientModel()
  const client = await PartyClients.create({
    ...payload,
    tenantId: context.tenantId,
  })

  return NextResponse.json({ success: true, data: client }, { status: 201 })
}
