import { NextResponse } from 'next/server'
import Transactions from '@models/Transactions'
import Events from '@models/Events'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const CATEGORY_ALIASES = {
  advance: 'deposit',
  client_payment: 'final_payment',
  colleague_percent: 'referral_in',
}

const normalizeCategory = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return 'other'
  return CATEGORY_ALIASES[raw] || raw
}

export const GET = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const { searchParams } = new URL(req.url)
  const eventIds = (searchParams.get('eventIds') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const clientId = (searchParams.get('clientId') || '').trim()
  const query = { tenantId }
  if (eventIds.length > 0) query.eventId = { $in: eventIds }
  if (clientId) query.clientId = clientId
  const transactions = await Transactions.find(query)
    .sort({ date: -1, createdAt: -1 })
    .lean()
  return NextResponse.json(
    { success: true, data: transactions },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()

  if (!body.eventId)
    return NextResponse.json(
      { success: false, error: 'Укажите мероприятие' },
      { status: 400 }
    )

  const event = await Events.findOne({ _id: body.eventId, tenantId }).lean()
  if (!event)
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено' },
      { status: 404 }
    )

  const clientId = event?.clientId ?? body.clientId
  if (!clientId)
    return NextResponse.json(
      { success: false, error: 'Для мероприятия не указан клиент' },
      { status: 400 }
    )

  const client = await Clients.findOne({ _id: clientId, tenantId }).lean()
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент мероприятия не найден' },
      { status: 404 }
    )
  if (event?.status === 'draft') {
    return NextResponse.json(
      { success: false, error: 'Транзакции недоступны для заявки' },
      { status: 400 }
    )
  }

  const paymentMethod =
    body.paymentMethod &&
    ['transfer', 'account', 'cash', 'barter'].includes(body.paymentMethod)
      ? body.paymentMethod
      : 'transfer'

  const transaction = await Transactions.create({
    tenantId,
    eventId: body.eventId,
    clientId,
    amount: Number(body.amount) || 0,
    type: body.type ?? 'expense',
    category: normalizeCategory(body.category),
    date: body.date ? new Date(body.date) : new Date(),
    comment: body.comment ?? '',
    paymentMethod,
  })

  if (body.contractSum !== undefined && body.eventId) {
    await Events.findOneAndUpdate(
      { _id: body.eventId, tenantId },
      {
      $set: { contractSum: Number(body.contractSum) || 0 },
      }
    )
  }

  return NextResponse.json({ success: true, data: transaction }, { status: 201 })
}
