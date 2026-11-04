'use client'

import { useEffect, useState } from 'react'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { PartyEventBriefView } from './PartyEventBrief'
import { getOrderPaymentState } from '@helpers/partyOrderTransactions'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50'
const dateText = (value, zone) =>
  value
    ? new Date(value).toLocaleString('ru-RU', {
        timeZone: zone,
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Не указано'
const money = (value) => Number(value || 0).toLocaleString('ru-RU') + ' ₽'

export default function PartyOrderReadModal({
  companyId,
  orderId,
  onClose,
  onEdit,
}) {
  const [state, setState] = useState({
    key: '',
    order: null,
    options: null,
    error: '',
  })
  const [retry, setRetry] = useState(0)
  const key = `${companyId}:${orderId}:${retry}`
  useEffect(() => {
    const controller = new AbortController()
    const config = {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }
    Promise.all([
      apiJson(`/api/party/orders/${orderId}`, config),
      apiJson(`/api/party/order-options?orderId=${orderId}`, config),
    ])
      .then(([record, options]) => {
        if (!controller.signal.aborted)
          setState({
            key,
            order: record.data,
            options: options.data,
            error: '',
          })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            key,
            order: null,
            options: null,
            error: cause.message || 'Заказ не найден или недоступен',
          })
      })
    return () => controller.abort()
  }, [companyId, orderId, key])
  const current = state.key === key
  const order = current ? state.order : null
  const options = current ? state.options : null
  const context = options?.context
  const zone = context?.company?.settings?.timeZone || 'Asia/Krasnoyarsk'
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const editable =
    order &&
    !['closed', 'canceled'].includes(order.status) &&
    [
      'orders.title',
      'orders.servicesIds',
      'orders.eventBrief',
      'orders.eventDate',
    ].some((resource) => can(resource, 'edit'))
  const location = options?.locations?.find(
    (item) => String(item._id) === String(order?.locationId)
  )
  const payment = order
    ? getOrderPaymentState({
        contractAmount: order.contractAmount,
        clientPayment: order.clientPayment,
        transactions: order.transactions,
      })
    : null
  return (
    <Modal
      open
      title={order?.orderTypeSnapshot || order?.title || 'Просмотр заказа'}
      tone="party"
      size="full"
      onClose={onClose}
      footer={
        <>
          {editable ? (
            onEdit ? (
              <button
                className={button}
                type="button"
                onClick={() => onEdit(order)}
              >
                Редактировать
              </button>
            ) : (
              <a
                className={button}
                href={`/company/work?${new URLSearchParams({ companyId, orderId, mode: 'edit' })}`}
              >
                Редактировать
              </a>
            )
          ) : null}
          <button className={button} type="button" onClick={onClose}>
            Закрыть просмотр
          </button>
        </>
      }
    >
      {!current ? (
        <p role="status">Загрузка заказа…</p>
      ) : state.error ? (
        <div role="alert" className="space-y-3 text-red-800">
          <p>{state.error}</p>
          <button
            type="button"
            className={button}
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : order ? (
        <div className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.hasOwn(order, 'eventDate') ? (
              <div>
                <dt className="text-sm text-slate-600">Программа</dt>
                <dd className="mt-1 font-semibold">
                  {dateText(order.eventDate, zone)}
                  {order.dateEnd ? ` — ${dateText(order.dateEnd, zone)}` : ''}
                </dd>
              </div>
            ) : null}
            {order.rental ? (
              <div>
                <dt className="text-sm text-slate-600">Аренда помещения</dt>
                <dd className="mt-1 font-semibold">
                  {dateText(order.rental.startsAt, zone)} —{' '}
                  {dateText(order.rental.endsAt, zone)}
                </dd>
              </div>
            ) : null}
            {order.client?.name ? (
              <div>
                <dt className="text-sm text-slate-600">Клиент</dt>
                <dd className="mt-1 font-semibold">{order.client.name}</dd>
              </div>
            ) : null}
            {order.client?.phone ? (
              <div>
                <dt className="text-sm text-slate-600">Телефон</dt>
                <dd className="mt-1">
                  <a
                    className="text-sky-800 underline"
                    href={`tel:${String(order.client.phone).replace(/[^+\d]/g, '')}`}
                  >
                    {order.client.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {location || order.customAddress ? (
              <div>
                <dt className="text-sm text-slate-600">Место</dt>
                <dd className="mt-1 font-semibold">
                  {location?.title || order.customAddress}
                </dd>
              </div>
            ) : null}
          </dl>
          {order.orderItems?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Услуги</h2>
              <ul className="divide-y divide-slate-100">
                {order.orderItems.map((item, index) => (
                  <li
                    className="flex justify-between gap-3 py-2"
                    key={`${item.serviceId}:${index}`}
                  >
                    <span>
                      {item.title} × {item.quantity}
                      {item.durationMinutes
                        ? ` · ${item.durationMinutes * item.quantity} мин`
                        : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {money(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : order.serviceSelections?.length ? (
            <ul>
              {order.serviceSelections.map((item) => (
                <li key={item.serviceId}>
                  {item.title} × {item.quantity}
                </li>
              ))}
            </ul>
          ) : order.serviceTitle ? (
            <p>{order.serviceTitle}</p>
          ) : null}
          {order.contractAmount !== undefined ? (
            <p className="text-lg font-semibold">
              Договорная сумма: {money(order.contractAmount)}
            </p>
          ) : null}
          {can('finance.payments') && payment ? (
            <p className="text-sm text-slate-600">
              Получено: {money(payment.incomeTotal)}
              {can('finance.clientAmount') && order.contractAmount !== undefined
                ? ` · Остаток: ${money(payment.balanceDue)}`
                : ''}
            </p>
          ) : null}
          {order.eventBrief ? (
            <PartyEventBriefView
              value={order.eventBrief}
              companyId={companyId}
              orderId={orderId}
              orderStatus={order.status}
              servicesIds={order.servicesIds}
            />
          ) : null}
          {order.performerComment ? (
            <section>
              <h2 className="font-semibold">Комментарий для команды</h2>
              <p className="mt-2 whitespace-pre-wrap">
                {order.performerComment}
              </p>
            </section>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
