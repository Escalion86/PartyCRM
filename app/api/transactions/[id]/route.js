import { NextResponse } from 'next/server'
import Transactions from '@models/Transactions'
import Events from '@models/Events'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const TRANSACTION_TYPES = new Set(['income', 'expense'])
const TRANSACTION_PAYMENT_METHODS = new Set([
  'transfer',
  'account',
  'cash',
  'barter',
])
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

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const existing = await Transactions.findOne({ _id: id, tenantId }).lean()
  if (!existing)
    return NextResponse.json(
      { success: false, error: 'Транзакция не найдена' },
      { status: 404 }
    )

  const update = {}
  if (body.amount !== undefined) update.amount = Number(body.amount) || 0
  if (body.date !== undefined) update.date = body.date ? new Date(body.date) : new Date()
  if (body.comment !== undefined) update.comment = body.comment ?? ''
  if (body.type && TRANSACTION_TYPES.has(body.type)) update.type = body.type
  if (body.category !== undefined) update.category = normalizeCategory(body.category)
  if (
    body.paymentMethod &&
    TRANSACTION_PAYMENT_METHODS.has(body.paymentMethod)
  ) {
    update.paymentMethod = body.paymentMethod
  }

  const nextEventId = body.eventId ?? existing.eventId
  if (!nextEventId)
    return NextResponse.json(
      { success: false, error: 'Укажите мероприятие' },
      { status: 400 }
    )
  const event = await Events.findOne({ _id: nextEventId, tenantId }).lean()
  if (!event)
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено' },
      { status: 404 }
    )
  if (event?.status === 'draft')
    return NextResponse.json(
      { success: false, error: 'Транзакции недоступны для заявки' },
      { status: 400 }
    )

  const nextClientId = event?.clientId ?? body.clientId ?? existing.clientId
  if (!nextClientId)
    return NextResponse.json(
      { success: false, error: 'Для мероприятия не указан клиент' },
      { status: 400 }
    )
  const client = await Clients.findOne({ _id: nextClientId, tenantId }).lean()
  if (!client)
    return NextResponse.json(
      { success: false, error: 'Клиент мероприятия не найден' },
      { status: 404 }
    )

  update.eventId = nextEventId
  update.clientId = nextClientId

  const transaction = await Transactions.findOneAndUpdate(
    { _id: id, tenantId },
    update,
    {
      returnDocument: 'after',
    }
  )

  return NextResponse.json({ success: true, data: transaction }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const deleted = await Transactions.findOneAndDelete({ _id: id, tenantId })
  if (!deleted)
    return NextResponse.json(
      { success: false, error: 'Транзакция не найдена' },
      { status: 404 }
    )
  return NextResponse.json({ success: true }, { status: 200 })
}
