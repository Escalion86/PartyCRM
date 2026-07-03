'use client'

import { useState, useCallback } from 'react'
import {
  faBan,
  faClock,
  faPen,
  faPlay,
  faLock,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import Modal from '@components/Modal'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'
import { getOrderPaymentState } from '@helpers/partyOrderTransactions'

const ORDER_STATUSES = [
  { value: 'draft', label: 'Заявка', color: 'gray', icon: faClock },
  { value: 'active', label: 'Подтверждён', color: 'blue', icon: faPlay },
  { value: 'canceled', label: 'Отменён', color: 'red', icon: faBan },
  { value: 'closed', label: 'Закрыт', color: 'green', icon: faLock },
]

const orderStatusColorMap = {
  draft: 'text-gray-500',
  active: 'text-blue-500',
  canceled: 'text-red-500',
  closed: 'text-green-500',
}

const OrderStatusModal = ({ open, order, onClose, onStatusChange, saving }) => {
  const [selectedStatus, setSelectedStatus] = useState(order?.status || 'draft')

  const handleSubmit = useCallback(async () => {
    if (!order?._id || selectedStatus === order.status) {
      onClose()
      return
    }
    await onStatusChange(order._id, selectedStatus)
    onClose()
  }, [order?._id, order?.status, selectedStatus, onStatusChange, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Статус заказа: ${order?.title || order?.serviceTitle || 'Заказ'}`}
      tone="party"
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-1">
          <button
            type="button"
            className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
            disabled={saving || selectedStatus === order?.status}
          >
            {saving ? 'Сохранение...' : 'Применить'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-black/60">Выберите новый статус заказа:</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((item) => {
            const isActive = item.value === selectedStatus
            const isCurrent = item.value === order?.status
            return (
              <button
                key={item.value}
                type="button"
                className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedStatus(item.value)}
              >
                <span>{item.label}</span>
                {isCurrent && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    текущий
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

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

  ;(Array.isArray(order.additionalEvents)
    ? order.additionalEvents
    : []
  ).forEach((item) => {
    if (item?.done) return
    const date = item?.date ? new Date(item.date) : null
    counts.open += 1
    if (!date || Number.isNaN(date.getTime())) return
    const day = startOfDay(date).getTime()
    if (day < today.getTime()) counts.overdue += 1
    else if (day === today.getTime()) counts.today += 1
    else if (day === tomorrow.getTime()) counts.tomorrow += 1
  })

  return counts
}

const currentStatusIcon = (status) => {
  const found = ORDER_STATUSES.find((s) => s.value === status)
  return found?.icon || faClock
}

const OrderCard = ({
  order,
  locations,
  clientsById,
  hasConflict,
  canManage,
  onCancel,
  onView,
  onEdit,
  onStatusChange,
  onDelete,
}) => {
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const location = locations.find((item) => item._id === order.locationId)
  const orderClient = getOrderClientLabel(order, clientsById)
  const contractAmount = getOrderContractAmount(order)
  const transactions = Array.isArray(order.transactions) ? order.transactions : []
  const paymentState = getOrderPaymentState({
    contractAmount,
    transactions,
  })
  const payoutTotal = getOrderPayoutTotal(order)
  const grossMargin = paymentState.margin - payoutTotal
  const additionalEventsBadges = getAdditionalEventsBadges(order)
  const statusConfig = ORDER_STATUSES.find((s) => s.value === order.status)
  const isClosed = order.status === 'closed'

  return (
    <>
      <PartyCard onClick={() => onView?.(order)}>
        <PartyCardHeader>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">
                {order.title || order.serviceTitle || 'Заказ'}
              </p>
              {statusConfig && (
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                    order.status === 'canceled'
                      ? 'bg-red-100 text-red-700'
                      : order.status === 'closed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : order.status === 'draft'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {statusConfig.label}
                </span>
              )}
              {hasConflict && (
                <span className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  Конфликт
                </span>
              )}
              {(order.assignedStaff ?? []).length === 0 && (
                <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                  Без исполнителя
                </span>
              )}
              {additionalEventsBadges.overdue > 0 && (
                <span className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  Просрочено: {additionalEventsBadges.overdue}
                </span>
              )}
              {additionalEventsBadges.today > 0 && (
                <span className="shrink-0 rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                  Сегодня: {additionalEventsBadges.today}
                </span>
              )}
              {additionalEventsBadges.tomorrow > 0 && (
                <span className="shrink-0 rounded bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-700">
                  Завтра: {additionalEventsBadges.tomorrow}
                </span>
              )}
              {additionalEventsBadges.open > 0 && (
                <span className="shrink-0 rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
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
            <p className="mt-1 truncate text-sm text-black/60">
              Клиент: {orderClient.name} · {orderClient.phone}
            </p>
            {order.adminComment ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-black/70">
                Комментарий: {order.adminComment}
              </p>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-black/60 sm:grid-cols-3">
              <span>Договор: {formatMoney(contractAmount)}</span>
              <span>Получено: {formatMoney(paymentState.incomeTotal)}</span>
              <span>Остаток: {formatMoney(paymentState.balanceDue)}</span>
              <span>Расходы: {formatMoney(paymentState.expenseTotal)}</span>
              <span>Выплаты: {formatMoney(payoutTotal)}</span>
              <span>Маржа: {formatMoney(grossMargin)}</span>
            </div>
          </div>
          {canManage && !isClosed && (
            <PartyCardActions>
              <CardButton
                icon={faPen}
                onClick={() => onEdit?.(order)}
                color="blue"
                tooltipText="Редактировать"
              />
              <CardButton
                icon={currentStatusIcon(order.status)}
                onClick={() => setStatusModalOpen(true)}
                color={
                  order.status === 'canceled'
                    ? 'red'
                    : order.status === 'closed'
                      ? 'green'
                      : order.status === 'draft'
                        ? 'gray'
                        : 'blue'
                }
                tooltipText={
                  statusConfig
                    ? `${statusConfig.label} (изменить статус)`
                    : 'Изменить статус'
                }
              />
              {order.status !== 'canceled' && (
                <CardButton
                  icon={faTrash}
                  onClick={() => onDelete(order._id)}
                  color="red"
                  tooltipText="Удалить"
                />
              )}
            </PartyCardActions>
          )}
        </PartyCardHeader>
      </PartyCard>

      {statusModalOpen && (
        <OrderStatusModal
          open={statusModalOpen}
          order={order}
          onClose={() => setStatusModalOpen(false)}
          onStatusChange={onStatusChange}
        />
      )}
    </>
  )
}

export default function OrdersList({
  orders = [],
  filteredOrders = [],
  locations,
  clientsById,
  hasOrderConflict,
  canManage,
  onCancel,
  onView,
  onEdit,
  onStatusChange,
  onDelete,
}) {
  return (
    <div className="mx-auto">
      <div className="grid gap-3">
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
            onCancel={onCancel}
            onView={onView}
            onEdit={onEdit}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
