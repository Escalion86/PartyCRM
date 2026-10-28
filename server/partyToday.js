import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '../helpers/partyRolePermissions.js'
import {
  canPartyTodayAccess,
  getPartyTodayAccess,
  getPartyTodayPeriod,
  partyTodayHref,
  projectPartyTodayOrder,
  PARTY_TODAY_CARD_LIMIT,
  PARTY_TODAY_SCAN_LIMIT,
} from '../helpers/partyToday.js'
import { getPartyOrderPreparationReadiness } from '../helpers/partyOrderPreparation.js'
import { getOrderPaymentState } from '../helpers/partyOrderTransactions.js'
import { applyPartyAssignmentConfirmationDefaults } from '../helpers/partyOrderAssignments.js'
import { getPartyWorkflow } from '../helpers/partyWorkflow.js'
import {
  getPartyOrderModel,
  getPartyStaffModel,
  getPartyTransactionModel,
} from './partyModels'
import { getPartyTaskModel } from './partyTaskModels'
import {
  buildPartyTaskListAccessFilter,
  canReadTask,
  serializeTask,
} from './partyTasks'
import { loadPartyInboxOverdue } from './partyInbox'
import getPartyCompanyTariffAccessState from './getPartyCompanyTariffAccess'

const descriptions = {
  orders_new: [
    'Новые заявки',
    'Текущие заявки на начальном рабочем этапе компании, в том числе без даты.',
    'Новых заявок на доступном начальном этапе нет.',
  ],
  tasks: [
    'Задачи на сегодня и просроченные',
    'Открытые задачи со сроком до конца сегодняшнего дня.',
    'Срочных задач по доступным данным нет.',
  ],
  inbox: [
    'Обращения требуют ответа',
    'Сохранённые просрочки ответа и следующего контакта в подключённых каналах.',
    'Сохранённых просрочек обращений нет.',
  ],
  orders_team: [
    'Нужно проверить команду',
    'Ближайшие 7 дней: команда не назначена или участие ещё не подтверждено.',
    'У ближайших мероприятий нет известных проблем с подтверждением команды.',
  ],
  orders_preparation: [
    'Нужно завершить подготовку',
    'Ближайшие 7 дней: незавершённая подготовка по включённому чек-листу заказа.',
    'У ближайших мероприятий нет незавершённой включённой подготовки.',
  ],
  payments: [
    'Заказы, ожидающие оплаты',
    'Текущие незакрытые заказы с ожидаемым авансом или остатком. Срок оплаты здесь не оценивается.',
    'Заказов с ожидаемой оплатой по проверенным данным нет.',
  ],
  orders_upcoming: [
    'Ближайшие мероприятия',
    'Текущие заказы на ближайшие 7 календарных дней компании.',
    'На ближайшие 7 дней доступных текущих мероприятий нет.',
  ],
}

const pageFor = (key) =>
  key === 'tasks'
    ? '/performer/tasks'
    : key === 'inbox'
      ? '/company/inbox'
      : '/performer/work'
const sectionBase = (context, key) => ({
  id: key,
  title: descriptions[key][0],
  description: descriptions[key][1],
  emptyText: descriptions[key][2],
  href: partyTodayHref(context, pageFor(key)),
})
const pageOf = (items, candidatesMore = false) => ({
  items: items.slice(0, PARTY_TODAY_CARD_LIMIT),
  hasMore: items.length > PARTY_TODAY_CARD_LIMIT,
  partial: candidatesMore && items.length <= PARTY_TODAY_CARD_LIMIT,
})
const id = (value) => String(value?._id ?? value ?? '')
const validTime = (value) => value && Number.isFinite(+new Date(value))

const loadTaskCards = async (context, period) => {
  const Tasks = await getPartyTaskModel()
  const accessFilter = await buildPartyTaskListAccessFilter(context)
  const rows = await Tasks.find({
    ...accessFilter,
    status: { $in: ['new', 'in_progress'] },
    dueAt: { $type: 'date', $lt: period.dayTo },
  })
    .sort({ dueAt: 1, _id: 1 })
    .limit(PARTY_TODAY_SCAN_LIMIT + 1)
    .lean()
  const candidates = rows.slice(0, PARTY_TODAY_SCAN_LIMIT)
  const orderIds = [
    ...new Set(candidates.map((task) => id(task.orderId)).filter(Boolean)),
  ]
  const Orders = orderIds.length ? await getPartyOrderModel() : null
  const orders = Orders
    ? await Orders.find({ tenantId: context.tenantId, _id: { $in: orderIds } })
        .select(
          '_id tenantId status workflowStageId locationId assignedStaff.staffId responsibleStaffId title serviceTitle eventDate dateEnd'
        )
        .lean()
    : []
  const byId = new Map(orders.map((order) => [id(order), order]))
  const cards = []
  for (const task of candidates) {
    const order = byId.get(id(task.orderId))
    if (!canReadTask(context, task, order)) continue
    const safe = serializeTask(context, task, { order })
    if (!validTime(safe.dueAt) || new Date(safe.dueAt) >= period.dayTo) continue
    const overdue = new Date(safe.dueAt) < period.now
    cards.push({
      id: id(task),
      kind: 'task',
      title: safe.title,
      reason: overdue ? 'Просроченная задача' : 'Срок задачи сегодня',
      dueAt: new Date(safe.dueAt).toISOString(),
      overdue,
      href: partyTodayHref(context, '/performer/tasks', { taskId: task._id }),
    })
    if (cards.length > PARTY_TODAY_CARD_LIMIT) break
  }
  return pageOf(cards, rows.length > PARTY_TODAY_SCAN_LIMIT)
}

const loadOrders = async (context, period, kind) => {
  const Orders = await getPartyOrderModel()
  const upcoming = !['payments', 'orders_new'].includes(kind)
  const initialStageId = getPartyWorkflow(context.company).initialStageId
  const clauses = [
    buildPartyOrderAccessFilter(context),
    { status: { $in: ['draft', 'active'] } },
    ...(kind === 'orders_new'
      ? [
          {
            $or: [
              { workflowStageId: initialStageId },
              { workflowStageId: null },
              { workflowStageId: '' },
            ],
          },
        ]
      : []),
    ...(upcoming
      ? [
          {
            eventDate: { $type: 'date', $lt: period.upcomingTo },
            ...(canPartyAccess(context, { resource: 'orders.dateEnd' })
              ? {
                  $or: [
                    { eventDate: { $gte: period.dayFrom } },
                    { dateEnd: { $gt: period.now } },
                  ],
                }
              : {
                  eventDate: {
                    $type: 'date',
                    $gte: period.dayFrom,
                    $lt: period.upcomingTo,
                  },
                }),
          },
        ]
      : []),
    ...(kind === 'orders_preparation' ? [{ 'preparation.enabled': true }] : []),
  ]
  const fields =
    '_id tenantId title serviceTitle client.name client.phone eventDate dateEnd status workflowStageId locationId responsibleStaffId assignedStaff.staffId assignedStaff.confirmationStatus' +
    (kind === 'orders_preparation' ? ' preparation' : '') +
    (kind === 'payments'
      ? ' contractAmount clientPayment.totalAmount transactions'
      : '')
  const rows = await Orders.find({ $and: clauses })
    .select(fields)
    .sort(upcoming ? { eventDate: 1, _id: 1 } : { _id: -1 })
    .limit(PARTY_TODAY_SCAN_LIMIT + 1)
    .lean()
  const candidates = rows.slice(0, PARTY_TODAY_SCAN_LIMIT)
  let staff = []
  if (kind === 'orders_team' && candidates.length) {
    const staffIds = [
      ...new Set(
        candidates
          .flatMap((order) =>
            (order.assignedStaff || []).map((assignment) =>
              id(assignment.staffId)
            )
          )
          .filter(Boolean)
      ),
    ]
    if (staffIds.length) {
      const Staff = await getPartyStaffModel()
      staff = await Staff.find({
        tenantId: context.tenantId,
        _id: { $in: staffIds },
        status: 'active',
      })
        .select('_id authUserId linkedAuthUserId')
        .lean()
    }
  }
  let ledgerByOrder = new Map()
  if (kind === 'payments' && candidates.length) {
    const Transactions = await getPartyTransactionModel()
    // Aggregation is bounded to these scoped orders and returns one total per
    // order, rather than loading an unbounded transaction journal into memory.
    const cast = (field, value) => Transactions.schema.path(field).cast(value)
    const ledger = await Transactions.aggregate([
      {
        $match: {
          tenantId: cast('tenantId', context.tenantId),
          orderId: {
            $in: candidates.map((order) => cast('orderId', order._id)),
          },
        },
      },
      {
        $group: {
          _id: '$orderId',
          incomeTotal: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
          },
          hasDeposit: {
            $max: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', 'income'] },
                    { $in: ['$category', ['deposit', 'client_payment']] },
                    { $gt: ['$amount', 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    ledgerByOrder = new Map(ledger.map((entry) => [id(entry), entry]))
  }
  const cards = []
  for (const order of candidates) {
    if (!canPartyAccess(context, { resource: 'orders', order })) continue
    let reason =
      kind === 'orders_new'
        ? 'Нужно обработать новую заявку'
        : 'Открыть мероприятие'
    if (kind === 'orders_team') {
      const assignments = applyPartyAssignmentConfirmationDefaults({
        assignedStaff: order.assignedStaff,
        staff,
      })
      if (!assignments.length) reason = 'Команда не назначена'
      else if (
        assignments.some(
          (assignment) =>
            !staff.some((person) => id(person) === id(assignment.staffId))
        )
      )
        reason = 'Один из назначенных сотрудников недоступен'
      else if (
        assignments.some(
          (assignment) => assignment.confirmationStatus === 'declined'
        )
      )
        reason = 'Есть отказ от участия'
      else if (
        assignments.some(
          (assignment) =>
            !['confirmed', 'done'].includes(assignment.confirmationStatus)
        )
      )
        reason = 'Не все участники подтвердили участие'
      else continue
    }
    if (kind === 'orders_preparation') {
      const readiness = getPartyOrderPreparationReadiness(order)
      if (!readiness.enabled || readiness.ok) continue
      const visibleBlockers = readiness.blockers.filter(
        (blocker) =>
          blocker.code !== 'address_acknowledgement_pending' ||
          canPartyAccess(context, { resource: 'orders.assignedStaff', order })
      )
      if (!visibleBlockers.length) continue
      reason = visibleBlockers[0].message
    }
    if (kind === 'payments') {
      const ledger = ledgerByOrder.get(id(order))
      const transactions = ledger
        ? [
            {
              type: 'income',
              category: ledger.hasDeposit ? 'deposit' : 'final_payment',
              amount: ledger.incomeTotal,
            },
          ]
        : order.transactions
      const payment = getOrderPaymentState({
        contractAmount:
          order.contractAmount ?? order.clientPayment?.totalAmount,
        transactions,
      })
      if (payment.balanceDue <= 0 || payment.status === 'none') continue
      reason =
        payment.status === 'wait_prepayment'
          ? 'Ожидается аванс'
          : 'Ожидается остаток оплаты'
    }
    const card = projectPartyTodayOrder(context, order, reason)
    if (card) cards.push(card)
    if (cards.length > PARTY_TODAY_CARD_LIMIT) break
  }
  return pageOf(cards, rows.length > PARTY_TODAY_SCAN_LIMIT)
}

const loadInboxCards = async (context, period) => {
  const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
  const channels = [
    'vk',
    'avito',
    ...(tariff.access?.allowTelegramIntegration ? ['telegram'] : []),
    'novofon',
  ]
  const result = await loadPartyInboxOverdue({
    tenantId: context.tenantId,
    channels,
    page: 0,
    now: period.now,
  })
  const items = result.items
    .slice(0, PARTY_TODAY_CARD_LIMIT + 1)
    .map((item) => {
      const deadlines = [item.nextContactAt, item.responseDueAt]
        .filter((value) => validTime(value) && new Date(value) < period.now)
        .map((value) => new Date(value))
      const deadline = deadlines.length
        ? new Date(Math.min(...deadlines.map(Number)))
        : null
      return {
        id: item.id,
        kind: 'inbox',
        title: item.title || 'Обращение клиента',
        reason:
          item.nextContactAt && new Date(item.nextContactAt) < period.now
            ? 'Просрочен следующий контакт'
            : 'Истёк срок ответа',
        overdue: true,
        ...(deadline ? { dueAt: deadline.toISOString() } : {}),
        href: partyTodayHref(context, '/company/inbox'),
      }
    })
  return {
    ...pageOf(items),
    hasMore: items.length > PARTY_TODAY_CARD_LIMIT || result.hasMore,
  }
}

export const loadPartyToday = async ({ context, now = new Date() }) => {
  if (!canPartyTodayAccess(context))
    throw Object.assign(new Error('Нет доступа к рабочему экрану'), {
      status: 403,
      code: 'partycrm_today_forbidden',
    })
  const period = getPartyTodayPeriod({
    now,
    timeZone: context.company?.settings?.timeZone,
  })
  const access = getPartyTodayAccess(context)
  const keys = Object.keys(access).filter((key) => access[key])
  const sections = await Promise.all(
    keys.map(async (key) => {
      try {
        const result =
          key === 'tasks'
            ? await loadTaskCards(context, period)
            : key === 'inbox'
              ? await loadInboxCards(context, period)
              : await loadOrders(context, period, key)
        return { ...sectionBase(context, key), ...result }
      } catch {
        return {
          ...sectionBase(context, key),
          items: [],
          hasMore: false,
          partial: false,
          error: 'Не удалось загрузить этот блок. Обновите рабочий экран.',
        }
      }
    })
  )
  return {
    generatedAt: period.now.toISOString(),
    timeZone: period.timeZone,
    dayFrom: period.dayFrom.toISOString(),
    dayTo: period.dayTo.toISOString(),
    context: {
      role: context.role,
      staffId: id(context.staff),
      positionTitle: context.position?.title || '',
    },
    sections,
  }
}
