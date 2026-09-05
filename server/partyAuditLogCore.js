const ORDER_STATUS_LABELS = {
  draft: 'Заявка',
  active: 'Подтвержден',
  canceled: 'Отменен',
  closed: 'Закрыт',
}

const ASSIGNMENT_STATUS_LABELS = {
  pending: 'ждет подтверждения',
  confirmed: 'подтвердил',
  declined: 'отказался',
  done: 'выполнено',
}

export const toPartyAuditId = (value) =>
  String(value?._id || value || '').trim()

const toText = (value) => String(value ?? '').trim()
const clipAuditValue = (value) => String(value ?? '').slice(0, 4000)
const toMoney = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`

const formatDate = (value) => {
  if (!value) return 'Не указано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Не указано' : date.toISOString()
}

const formatAddress = (order = {}) => {
  if (order.placeType === 'company_location') {
    return order.locationId
      ? `Точка #${toPartyAuditId(order.locationId).slice(-6)}`
      : 'Точка не выбрана'
  }
  const address = order.clientAddress || {}
  return (
    order.customAddress ||
    [address.town, address.street, address.house, address.room, address.comment]
      .filter(Boolean)
      .join(', ') ||
    'Адрес не указан'
  )
}

const formatAssignments = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 'Не назначены'
  return items
    .map((item) => {
      const staffId = toPartyAuditId(item?.staffId)
      const status =
        ASSIGNMENT_STATUS_LABELS[item?.confirmationStatus] || 'ожидает'
      return `Сотрудник #${staffId.slice(-6)} — ${toMoney(item?.payoutAmount)}, ${status}`
    })
    .join('; ')
}

const formatAdditionalEvents = (items) => {
  if (!Array.isArray(items) || items.length === 0) return 'Нет'
  return items
    .map(
      (item) =>
        `${toText(item?.title) || 'Без названия'} (${formatDate(item?.date)}, ${
          item?.done ? 'выполнено' : 'открыто'
        })`
    )
    .join('; ')
}

const field = (name, label, format = toText) => ({ name, label, format })

const ORDER_AUDIT_FIELDS = [
  field('title', 'Название'),
  field('status', 'Статус', (value) =>
    ORDER_STATUS_LABELS[value] || toText(value)
  ),
  field('eventDate', 'Дата и время', formatDate),
  field('durationMinutes', 'Длительность', (value) =>
    `${Number(value || 0)} мин`
  ),
  field('placeType', 'Формат', (value) =>
    value === 'company_location' ? 'Точка компании' : 'Выезд к клиенту'
  ),
  field('address', 'Место', (_value, order) => formatAddress(order)),
  field('client', 'Клиент', (_value, order) =>
    toText(order?.client?.name) ||
    (order?.clientId
      ? `Клиент #${toPartyAuditId(order.clientId).slice(-6)}`
      : 'Не указан')
  ),
  field('services', 'Услуги', (_value, order) => {
    const ids = Array.isArray(order?.servicesIds)
      ? order.servicesIds.map(toPartyAuditId)
      : []
    const serviceIds = ids.map((id) => `Услуга #${id.slice(-6)}`).join('; ')
    return [toText(order?.serviceTitle), serviceIds].filter(Boolean).join('; ') ||
      'Не указаны'
  }),
  field('responsibleStaffId', 'Ответственный', (value) =>
    value ? `Сотрудник #${toPartyAuditId(value).slice(-6)}` : 'Не назначен'
  ),
  field('contractAmount', 'Сумма договора', toMoney),
  field('paymentStatus', 'Статус оплаты', (_value, order) =>
    toText(order?.clientPayment?.status) || 'Не указан'
  ),
  field('assignedStaff', 'Исполнители и гонорары', formatAssignments),
  field('adminComment', 'Комментарий администратора'),
  field('performerComment', 'Комментарий исполнителю'),
  field('additionalEvents', 'Дополнительные события', formatAdditionalEvents),
]

const getComparableValue = (descriptor, order = {}) => {
  if (
    ['address', 'client', 'services', 'paymentStatus'].includes(descriptor.name)
  ) {
    return descriptor.format(undefined, order)
  }
  return descriptor.format(order?.[descriptor.name], order)
}

export const buildPartyOrderAuditChanges = (before = {}, after = {}) =>
  ORDER_AUDIT_FIELDS.reduce((changes, descriptor) => {
    const previousValue = getComparableValue(descriptor, before)
    const nextValue = getComparableValue(descriptor, after)
    if (previousValue === nextValue) return changes
    changes.push({
      field: descriptor.name,
      label: descriptor.label,
      before: clipAuditValue(previousValue),
      after: clipAuditValue(nextValue),
    })
    return changes
  }, [])

export const getPartyAuditActor = (context = {}) => {
  const staff = context.staff || context.activeMembership?.staff || {}
  const user = context.sessionUser || context.session?.user || {}
  const actorName =
    [staff.secondName, staff.firstName].filter(Boolean).join(' ').trim() ||
    [user.secondName, user.firstName].filter(Boolean).join(' ').trim() ||
    staff.phone ||
    user.phone ||
    'Система'

  return {
    actorUserId: toPartyAuditId(user),
    actorStaffId: toPartyAuditId(staff) || null,
    actorName,
    actorRole: context.role || staff.role || 'system',
  }
}

export const getPartyOrderAuditTitle = (order = {}) =>
  toText(order.title) ||
  toText(order.serviceTitle) ||
  toText(order.client?.name) ||
  `Заказ #${toPartyAuditId(order).slice(-6)}`
