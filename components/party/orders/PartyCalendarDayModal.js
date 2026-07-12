'use client'

import Modal from '@components/Modal'

const formatDayTitle = (value) =>
  value.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const formatTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Время не указано'
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PartyCalendarDayModal({
  day,
  items = [],
  ordersById,
  locationsById,
  onClose,
  onOpenOrder,
}) {
  if (!day) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={formatDayTitle(day.date)}
      tone="party"
      size="lg"
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
      <div className="grid gap-2">
        <div className="text-sm text-slate-500">
          Заказы и дополнительные события: {items.length}
        </div>
        {items.map((item, index) => {
          const order = ordersById.get(String(item.orderId))
          const location =
            order?.locationId && locationsById.get(String(order.locationId))
          const isOrder = item.type === 'order'

          return (
            <div
              key={`${item.type}-${item.orderId}-${item.itemIndex ?? index}`}
              className={`rounded-xl border p-3 ${
                isOrder
                  ? 'border-sky-100 bg-sky-50/60'
                  : item.done
                    ? 'border-emerald-100 bg-emerald-50/60'
                    : 'border-amber-100 bg-amber-50/60'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {formatTime(item.startsAt)} · {item.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isOrder
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isOrder ? 'Заказ' : 'Доп. событие'}
                    </span>
                  </div>
                  {!isOrder && order ? (
                    <div className="mt-1 text-xs text-slate-600">
                      Заказ: {order.title || order.serviceTitle || 'Без названия'}
                    </div>
                  ) : null}
                  {location?.title ? (
                    <div className="mt-1 text-xs text-slate-500">
                      {location.title}
                    </div>
                  ) : null}
                </div>
                {order ? (
                  <button
                    type="button"
                    onClick={() => onOpenOrder?.(order)}
                    className="shrink-0 cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                  >
                    Открыть заказ
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
