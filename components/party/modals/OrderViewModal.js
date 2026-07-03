'use client'

import Modal from '@components/Modal'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getOrderPaymentState,
  getPartyPayoutStatusLabel,
  normalizePartyPayoutStatus,
} from '@helpers/partyOrderTransactions'

const ORDER_STATUS_LABELS = {
  draft: 'Заявка',
  active: 'Подтвержден',
  canceled: 'Отменен',
  closed: 'Закрыт',
}

const PLACE_TYPE_LABELS = {
  company_location: 'Точка компании',
  client_address: 'Выезд к клиенту',
}

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

const Section = ({ title, children }) => (
  <section className="rounded-lg border border-sky-100 bg-white p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {title}
    </div>
    {children}
  </section>
)

const InfoLine = ({ label, children }) => (
  <div className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
    <div className="font-semibold text-slate-500">{label}</div>
    <div className="min-w-0 break-words text-slate-900">{children || '-'}</div>
  </div>
)

const getOrderContractAmount = (order) =>
  Number(order?.contractAmount ?? order?.clientPayment?.totalAmount ?? 0)

const getOrderPayoutTotal = (order) =>
  (order?.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item?.payoutAmount || 0),
    0
  )

const getClientLabel = (order, clientsById) => {
  const client = order?.clientId
    ? clientsById.get(String(order.clientId))
    : null
  return {
    client,
    name: client
      ? getPersonFullName(client, { fallback: 'Без имени' })
      : order?.client?.name || 'Не указан',
    phone: client?.phone || order?.client?.phone || '',
    email: client?.email || order?.client?.email || '',
  }
}

const getStaffLabel = (staffMember) =>
  [staffMember?.secondName, staffMember?.firstName].filter(Boolean).join(' ') ||
  staffMember?.phone ||
  staffMember?.email ||
  'Без имени'

export default function OrderViewModal({
  open,
  order,
  locations = [],
  staff = [],
  clientsById,
  services = [],
  canManage = false,
  onClose,
  onEdit,
}) {
  const safeClientsById = clientsById ?? new Map()
  const location = locations.find(
    (item) => String(item._id) === String(order?.locationId)
  )
  const client = getClientLabel(order, safeClientsById)
  const serviceTitles = (order?.servicesIds ?? [])
    .map((serviceId) =>
      services.find((service) => String(service._id) === String(serviceId))
    )
    .filter(Boolean)
    .map((service) => service.title)
  const contractAmount = getOrderContractAmount(order)
  const transactions = Array.isArray(order?.transactions)
    ? order.transactions
    : []
  const paymentState = getOrderPaymentState({ contractAmount, transactions })
  const payoutTotal = getOrderPayoutTotal(order)
  const grossMargin = paymentState.margin - payoutTotal
  const assignedStaff = Array.isArray(order?.assignedStaff)
    ? order.assignedStaff
    : []
  const additionalEvents = Array.isArray(order?.additionalEvents)
    ? order.additionalEvents
    : []

  const footer = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        onClick={onClose}
      >
        Закрыть
      </button>
      {canManage ? (
        <button
          type="button"
          className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          onClick={onEdit}
        >
          Редактировать
        </button>
      ) : null}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Просмотр заказа"
      tone="party"
      size="full"
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        <Section title="Заказ">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold break-words text-slate-950">
                  {order?.title || order?.serviceTitle || 'Заказ'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Создано: {formatDateTime(order?.createdAt)}
                </p>
              </div>
              <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                {ORDER_STATUS_LABELS[order?.status] || order?.status || 'Статус не указан'}
              </span>
            </div>
            <InfoLine label="Дата и время">{formatDateTime(order?.eventDate)}</InfoLine>
            <InfoLine label="Длительность">
              {order?.durationMinutes ? `${order.durationMinutes} мин` : '-'}
            </InfoLine>
            <InfoLine label="Формат">
              {PLACE_TYPE_LABELS[order?.placeType] || 'Не указан'}
            </InfoLine>
            <InfoLine label="Место">
              {order?.placeType === 'company_location'
                ? location?.title || 'Точка не выбрана'
                : order?.customAddress || 'Выездной адрес не указан'}
            </InfoLine>
            {order?.adminComment ? (
              <InfoLine label="Комментарий">{order.adminComment}</InfoLine>
            ) : null}
          </div>
        </Section>

        <Section title="Клиент">
          <div className="flex flex-col gap-2">
            <InfoLine label="Имя">{client.name}</InfoLine>
            <InfoLine label="Телефон">{client.phone || 'Не указан'}</InfoLine>
            {client.email ? <InfoLine label="Email">{client.email}</InfoLine> : null}
          </div>
        </Section>

        <Section title="Услуги">
          {serviceTitles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {serviceTitles.map((title) => (
                <span
                  key={title}
                  className="rounded bg-sky-50 px-2 py-1 text-sm font-semibold text-sky-800"
                >
                  {title}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Услуги не указаны.</p>
          )}
        </Section>

        <Section title="Команда">
          {assignedStaff.length > 0 ? (
            <div className="grid gap-2">
              {assignedStaff.map((assignment) => {
                const staffMember = staff.find(
                  (item) => String(item._id) === String(assignment.staffId)
                )
                return (
                  <div
                    key={assignment.staffId}
                    className="rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
                  >
                    <div className="font-semibold text-slate-900">
                      {getStaffLabel(staffMember)}
                    </div>
                    <div className="mt-1 text-slate-600">
                      Выплата: {formatMoney(Number(assignment.payoutAmount || 0))}
                      {' · '}
                      {getPartyPayoutStatusLabel(
                        normalizePartyPayoutStatus(assignment.payoutStatus)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Исполнители не назначены.</p>
          )}
        </Section>

        <Section title="Финансы">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <InfoLine label="Договор">{formatMoney(contractAmount)}</InfoLine>
            <InfoLine label="Получено">{formatMoney(paymentState.incomeTotal)}</InfoLine>
            <InfoLine label="Остаток">{formatMoney(paymentState.balanceDue)}</InfoLine>
            <InfoLine label="Расходы">{formatMoney(paymentState.expenseTotal)}</InfoLine>
            <InfoLine label="Выплаты">{formatMoney(payoutTotal)}</InfoLine>
            <InfoLine label="Маржа">{formatMoney(grossMargin)}</InfoLine>
          </div>
        </Section>

        <Section title="Доп. события">
          {additionalEvents.length > 0 ? (
            <div className="grid gap-2">
              {additionalEvents.map((item, index) => (
                <div
                  key={`${item?.title || 'event'}-${index}`}
                  className="rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      {item?.title || 'Без названия'}
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        item?.done
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {item?.done ? 'Выполнено' : 'Открыто'}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-600">
                    {formatDateTime(item?.date)}
                  </div>
                  {item?.description ? (
                    <div className="mt-1 whitespace-pre-wrap text-slate-700">
                      {item.description}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Дополнительные события не добавлены.</p>
          )}
        </Section>
      </div>
    </Modal>
  )
}
