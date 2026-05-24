'use client'

import { faBoxArchive } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'

const getOrderClientLabel = (order, clientsById) => {
  const currentClient = order?.clientId
    ? clientsById.get(String(order.clientId))
    : null

  return {
    name: currentClient
      ? getPersonFullName(currentClient, { fallback: 'не указан' })
      : order?.client?.name || 'не указан',
    phone: currentClient?.phone || order?.client?.phone || 'телефон не указан',
  }
}

const getOrderPayoutTotal = (order) =>
  (order.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item.payoutAmount || 0),
    0
  )

const getOrderContractAmount = (order) =>
  Number(order.contractAmount ?? order.clientPayment?.totalAmount ?? 0)

const getOrderTransactionTotal = (order, type) =>
  (order.transactions ?? [])
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)

const formatDateTime = (value) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const getAdditionalEventsBadges = (order) => {
  const today = startOfDay(new Date())
  const tomorrow = startOfDay(addDays(today, 1))
  const counts = { overdue: 0, today: 0, tomorrow: 0, open: 0 }

  ;(Array.isArray(order.additionalEvents) ? order.additionalEvents : []).forEach(
    (item) => {
      if (item?.done) return
      const date = item?.date ? new Date(item.date) : null
      counts.open += 1
      if (!date || Number.isNaN(date.getTime())) return
      const day = startOfDay(date).getTime()
      if (day < today.getTime()) counts.overdue += 1
      else if (day === today.getTime()) counts.today += 1
      else if (day === tomorrow.getTime()) counts.tomorrow += 1
    }
  )

  return counts
}

const OrderCard = ({
  order,
  locations,
  clientsById,
  hasConflict,
  canManage,
  onArchive,
  onEdit,
}) => {
  const location = locations.find((item) => item._id === order.locationId)
  const orderClient = getOrderClientLabel(order, clientsById)
  const payoutTotal = getOrderPayoutTotal(order)
  const incomeTotal = getOrderTransactionTotal(order, 'income')
  const additionalEventsBadges = getAdditionalEventsBadges(order)

  return (
    <PartyCard onClick={() => onEdit?.(order)}>
      <PartyCardHeader>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold truncate">
              {order.title || order.serviceTitle || 'Заказ'}
            </p>
            {hasConflict && (
              <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded shrink-0">
                Конфликт
              </span>
            )}
            {(order.assignedStaff ?? []).length === 0 && (
              <span className="px-2 py-1 text-xs font-semibold rounded shrink-0 bg-amber-100 text-amber-700">
                Без исполнителя
              </span>
            )}
            {additionalEventsBadges.overdue > 0 && (
              <span className="px-2 py-1 text-xs font-semibold rounded shrink-0 bg-red-100 text-red-700">
                Просрочено: {additionalEventsBadges.overdue}
              </span>
            )}
            {additionalEventsBadges.today > 0 && (
              <span className="px-2 py-1 text-xs font-semibold rounded shrink-0 bg-sky-100 text-sky-700">
                Сегодня: {additionalEventsBadges.today}
              </span>
            )}
            {additionalEventsBadges.tomorrow > 0 && (
              <span className="px-2 py-1 text-xs font-semibold rounded shrink-0 bg-cyan-100 text-cyan-700">
                Завтра: {additionalEventsBadges.tomorrow}
              </span>
            )}
            {additionalEventsBadges.open > 0 && (
              <span className="px-2 py-1 text-xs font-semibold rounded shrink-0 bg-sky-100 text-sky-700">
                Задачи: {additionalEventsBadges.open}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-black/60">
            {formatDateTime(order.eventDate)} ·{' '}
            {order.placeType === 'company_location'
              ? location?.title || 'Точка не выбрана'
              : order.customAddress || 'Выездной адрес не указан'}
          </p>
          <p className="mt-1 text-sm truncate text-black/60">
            Клиент: {orderClient.name} · {orderClient.phone}
          </p>
          <p className="mt-1 text-sm text-black/60">
            Договор: {formatMoney(getOrderContractAmount(order))} · получено:{' '}
            {formatMoney(incomeTotal)} · выплаты: {formatMoney(payoutTotal)}
          </p>
        </div>
        {canManage && (
          <PartyCardActions>
            <CardButton
              icon={faBoxArchive}
              onClick={() => onArchive(order._id)}
              color="red"
              tooltipText="Отменить"
            />
          </PartyCardActions>
        )}
      </PartyCardHeader>
    </PartyCard>
  )
}

export default function OrdersList({
  orders = [],
  filteredOrders = [],
  locations,
  clientsById,
  hasOrderConflict,
  canManage,
  onArchive,
  onEdit,
  orderFilter,
  onFilterChange,
  orderFilters,
  ordersCount,
  onCreateClick,
  onUpcomingClick,
  onClosePastClick,
  closePastCount = 0,
  title = 'Заказы',
}) {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-black/55">{ordersCount}</span>
          {onUpcomingClick && (
            <button
              type="button"
              onClick={onUpcomingClick}
              className="cursor-pointer rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              Ближайшие
            </button>
          )}
          {onClosePastClick && (
            <button
              type="button"
              onClick={onClosePastClick}
              disabled={closePastCount === 0}
              className="cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Закрыть прошедшие
              <span className="ml-2 text-sky-400">{closePastCount}</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onCreateClick}
              className="grid w-10 h-10 text-2xl font-semibold leading-none text-white transition-colors rounded-md place-items-center bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Создать заказ"
              title="Создать заказ"
            >
              +
            </button>
          )}
        </div>
      </div>

      {orderFilters && (
        <div className="flex flex-wrap gap-2 mt-5">
          {orderFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onFilterChange(filter.value)}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                orderFilter === filter.value
                  ? 'border-sky-600 bg-sky-600 text-white'
                  : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'
              }`}
            >
              {filter.label}
              <span
                className={`ml-2 ${
                  orderFilter === filter.value
                    ? 'text-white/80'
                    : 'text-slate-400'
                }`}
              >
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 mt-5">
        {orders.length === 0 && (
          <p className="text-sm text-black/55">Заказы еще не добавлены.</p>
        )}
        {orders.length > 0 && filteredOrders.length === 0 && (
          <p className="text-sm text-black/55">
            По выбранному фильтру заказов нет.
          </p>
        )}
        {filteredOrders.map((order) => (
          <OrderCard
            key={order._id}
            order={order}
            locations={locations}
            clientsById={clientsById}
            hasConflict={hasOrderConflict(order, orders)}
            canManage={canManage}
            onArchive={onArchive}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}
