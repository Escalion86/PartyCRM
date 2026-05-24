'use client'

import Modal from '@components/Modal'

const parseDateSafe = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const isSameDay = (value, day) => {
  const date = parseDateSafe(value)
  if (!date) return false
  return startOfDay(date).getTime() === startOfDay(day).getTime()
}

const formatDateTime = (value) => {
  const date = parseDateSafe(value)
  if (!date) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const normalizeText = (value, fallback) =>
  String(value || '').trim() || fallback

const getOrderEndDate = (order) => {
  const explicitEnd = parseDateSafe(order?.dateEnd)
  if (explicitEnd) return explicitEnd
  return parseDateSafe(order?.eventDate)
}

const collectAdditionalEvents = (orders, now) => {
  const today = startOfDay(now)
  const tomorrow = startOfDay(addDays(now, 1))
  const segments = {
    overdue: [],
    today: [],
    tomorrow: [],
  }

  orders.forEach((order) => {
    ;(Array.isArray(order.additionalEvents) ? order.additionalEvents : []).forEach(
      (item, index) => {
        if (item?.done) return
        const date = parseDateSafe(item?.date)
        if (!date) return
        const payload = { order, item, index }
        if (startOfDay(date).getTime() < today.getTime()) {
          segments.overdue.push(payload)
        } else if (isSameDay(date, today)) {
          segments.today.push(payload)
        } else if (isSameDay(date, tomorrow)) {
          segments.tomorrow.push(payload)
        }
      }
    )
  })

  Object.values(segments).forEach((items) =>
    items.sort(
      (a, b) =>
        parseDateSafe(a.item.date).getTime() - parseDateSafe(b.item.date).getTime()
    )
  )

  return segments
}

const Section = ({ title, count, emptyText, children }) => (
  <section className="rounded-2xl border border-sky-100 bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
        {count}
      </span>
    </div>
    {count === 0 ? (
      <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
    ) : (
      <div className="mt-3 grid gap-2">{children}</div>
    )}
  </section>
)

const ActionButton = ({ children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="cursor-pointer rounded-md border border-sky-100 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {children}
  </button>
)

export default function PartyUpcomingEventsModal({
  open,
  orders = [],
  onClose,
  onOpenOrder,
  onUpdateOrder,
  saving,
}) {
  const now = new Date()
  const segments = collectAdditionalEvents(orders, now)
  const upcomingOrders = orders
    .filter((order) => !['closed', 'canceled'].includes(order.status))
    .filter((order) => {
      const date = parseDateSafe(order.eventDate)
      if (!date) return false
      const today = startOfDay(now).getTime()
      const limit = startOfDay(addDays(now, 3)).getTime()
      const day = startOfDay(date).getTime()
      return day >= today && day <= limit
    })
    .sort((a, b) => parseDateSafe(a.eventDate) - parseDateSafe(b.eventDate))

  const updateAdditionalEvent = (order, index, patch) => {
    const additionalEvents = Array.isArray(order.additionalEvents)
      ? order.additionalEvents
      : []
    const nextAdditionalEvents = additionalEvents.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    )
    onUpdateOrder?.({ ...order, additionalEvents: nextAdditionalEvents })
  }

  const shiftAdditionalEvent = (order, index, days) => {
    const item = order.additionalEvents?.[index]
    const sourceDate = parseDateSafe(item?.date) || new Date()
    const nextDate = addDays(sourceDate, days)
    updateAdditionalEvent(order, index, { date: nextDate.toISOString() })
  }

  const markAdditionalEventDone = (order, index) => {
    updateAdditionalEvent(order, index, {
      done: true,
      doneAt: new Date().toISOString(),
    })
  }

  const renderAdditionalItem = ({ order, item, index }) => (
    <div
      key={`${order._id}-${index}`}
      className="rounded-xl border border-sky-100 bg-sky-50/60 p-3"
    >
      <div className="flex flex-col gap-1">
        <div className="text-sm font-bold text-slate-900">
          {normalizeText(item.title, 'Доп. событие')}
        </div>
        <div className="text-xs text-slate-600">{formatDateTime(item.date)}</div>
        {item.description ? (
          <div className="text-xs text-slate-600">
            {normalizeText(item.description, '')}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenOrder?.(order)}
          className="mt-1 cursor-pointer text-left text-xs font-semibold text-sky-700 hover:text-sky-900"
        >
          {normalizeText(order.title || order.serviceTitle, 'Открыть заказ')}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton
          disabled={saving}
          onClick={() => markAdditionalEventDone(order, index)}
        >
          Выполнено
        </ActionButton>
        <ActionButton
          disabled={saving}
          onClick={() => shiftAdditionalEvent(order, index, 1)}
        >
          +1 день
        </ActionButton>
        <ActionButton
          disabled={saving}
          onClick={() => shiftAdditionalEvent(order, index, 3)}
        >
          +3 дня
        </ActionButton>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ближайшие события"
      tone="party"
      size="2xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Закрыть
        </button>
      }
    >
      <div className="grid gap-3">
        <Section
          title="Просрочено"
          count={segments.overdue.length}
          emptyText="Просроченных доп. событий нет"
        >
          {segments.overdue.map(renderAdditionalItem)}
        </Section>
        <Section
          title="Сегодня"
          count={segments.today.length}
          emptyText="На сегодня доп. событий нет"
        >
          {segments.today.map(renderAdditionalItem)}
        </Section>
        <Section
          title="Завтра"
          count={segments.tomorrow.length}
          emptyText="На завтра доп. событий нет"
        >
          {segments.tomorrow.map(renderAdditionalItem)}
        </Section>
        <Section
          title="Заказы на 3 дня"
          count={upcomingOrders.length}
          emptyText="В ближайшие 3 дня заказов нет"
        >
          {upcomingOrders.slice(0, 12).map((order) => (
            <div
              key={order._id}
              className="rounded-xl border border-sky-100 bg-sky-50/60 p-3"
            >
              <div className="text-sm font-bold text-slate-900">
                {formatDateTime(order.eventDate)}
              </div>
              <div className="text-xs text-slate-600">
                {normalizeText(order.title || order.serviceTitle, 'Заказ')}
              </div>
              <div className="mt-2">
                <ActionButton onClick={() => onOpenOrder?.(order)}>
                  Открыть заказ
                </ActionButton>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </Modal>
  )
}

export { collectAdditionalEvents, getOrderEndDate, parseDateSafe, startOfDay }
