import { createHash } from 'node:crypto'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { getPartyOrderModel, getPartyTransactionModel } from './partyModels'
import { withPartyFinancialTransaction } from './partyFinancialSettlements'
import {
  withPartyOrderVenueWrite,
  supportsPartyVenueTransactions,
} from './partyVenueBookings'

const fail = (
  message,
  status = 400,
  code = 'partycrm_initial_payment_invalid'
) => {
  throw Object.assign(new Error(message), { status, code })
}
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
      : value

export const parsePartyInitialPayment = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Проверьте аванс')
  const cents = Math.round(Number(value.amount) * 100)
  if (
    !['number', 'string'].includes(typeof value.amount) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(Number(value.amount) * 100 - cents) > 1e-6
  )
    fail('Укажите положительный аванс с точностью до копеек')
  if (!['transfer', 'account', 'cash'].includes(value.paymentMethod))
    fail('Выберите способ получения аванса')
  if (value.date !== undefined && !parsePartyIsoDate(value.date))
    fail('Укажите существующую дату получения аванса')
  if (
    value.comment !== undefined &&
    (typeof value.comment !== 'string' || value.comment.length > 1000)
  )
    fail('Комментарий к авансу — не более 1000 символов')
  return {
    amount: cents / 100,
    date: value.date ? parsePartyIsoDate(value.date) : null,
    paymentMethod: value.paymentMethod,
    comment: value.comment?.trim() || '',
  }
}

export const buildPartyOrderCreateIdentity = ({ key, context, body }) => {
  const actor = String(context.staff?._id || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(String(key || '')) || !actor)
    fail(
      'Для сохранения заказа с авансом нужен ключ операции',
      400,
      'partycrm_order_create_key_invalid'
    )
  return {
    createRequestKey: key,
    createRequestActorId: actor,
    createRequestFingerprint: createHash('sha256')
      .update(
        JSON.stringify(
          canonical({ tenantId: String(context.tenantId), actor, body })
        )
      )
      .digest('hex'),
  }
}

export const createPartyOrderPaymentService = ({
  getOrders = getPartyOrderModel,
  getTransactions = getPartyTransactionModel,
  financialTransaction = withPartyFinancialTransaction,
  venueWrite = withPartyOrderVenueWrite,
  supportsTransactions = supportsPartyVenueTransactions,
} = {}) => {
  const replay = async ({ context, identity, session = null }) => {
    const Orders = await getOrders()
    const order = await Orders.findOne({
      tenantId: context.tenantId,
      createRequestKey: identity.createRequestKey,
      createRequestActorId: identity.createRequestActorId,
    })
      .session(session)
      .lean()
    if (!order) return null
    if (order.createRequestFingerprint !== identity.createRequestFingerprint)
      fail(
        'Этот ключ уже использован с другими данными. Обновите форму.',
        409,
        'partycrm_order_create_key_conflict'
      )
    if (!canPartyAccess(context, { resource: 'orders', order }))
      fail(
        'Нет доступа к сохранённому заказу',
        403,
        'partycrm_order_create_replay_forbidden'
      )
    return order
  }
  const create = async ({
    context,
    identity,
    payment,
    payload,
    checkConflicts,
  }) => {
    if (
      !canPartyAccess(context, {
        resource: 'finance.payments',
        action: 'edit',
        order: payload,
      })
    )
      fail(
        'Нет права записывать аванс',
        403,
        'partycrm_initial_payment_forbidden'
      )
    if (payment.amount > Number(payload.contractAmount || 0))
      fail('Аванс превышает согласованную сумму заказа')
    if (
      payload.transactions?.length ||
      Number(payload.clientPayment?.prepaidAmount || 0)
    )
      fail('Укажите полученный аванс только в поле «Аванс при создании»')
    const Orders = await getOrders(),
      Transactions = await getTransactions()
    if (!(await supportsTransactions()))
      fail(
        'Совместное сохранение заказа и аванса пока недоступно. Очистите аванс, чтобы создать обычный заказ, или обратитесь к администратору.',
        503,
        'partycrm_initial_payment_transaction_required'
      )
    await Orders.init()
    return financialTransaction(context.tenantId, async (session) => {
      const previous = await replay({ context, identity, session })
      if (previous) return { order: previous, replayed: true }
      const order = await venueWrite({
        tenantId: context.tenantId,
        nextOrder: payload,
        session,
        work: async ({ session: sameSession }) => {
          if (!sameSession || sameSession !== session)
            fail(
              'Не удалось начать единое сохранение заказа и аванса',
              503,
              'partycrm_initial_payment_transaction_required'
            )
          await checkConflicts(session)
          const [record] = await Orders.create(
            [
              {
                ...payload,
                ...identity,
                tenantId: context.tenantId,
                transactions: [],
                clientPayment: {
                  totalAmount: payload.contractAmount,
                  prepaidAmount: payment.amount,
                  status:
                    payment.amount >= payload.contractAmount
                      ? 'paid'
                      : 'prepaid',
                },
              },
            ],
            { session }
          )
          await Transactions.create(
            [
              {
                tenantId: context.tenantId,
                orderId: record._id,
                clientId: record.clientId || null,
                type: 'income',
                category: 'deposit',
                ...payment,
                date: payment.date || new Date(),
              },
            ],
            { session }
          )
          return record
        },
      })
      return { order, replayed: false }
    })
  }
  return { replay, create }
}
const service = createPartyOrderPaymentService()
export const findPartyOrderCreateReplay = service.replay
export const createPartyOrderWithPayment = service.create
