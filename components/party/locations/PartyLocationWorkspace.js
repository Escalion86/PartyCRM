'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import Modal from '@components/Modal'
import {
  partyTransactionCategoryLabels,
  partyPaymentMethodLabels,
} from '@helpers/partyHelpers'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const money = (amount) => `${Number(amount || 0).toLocaleString('ru-RU')} ₽`
const date = (value) =>
  value ? new Date(value).toLocaleString('ru-RU') : 'Дата не указана'
const statuses = {
  draft: 'Заявка',
  active: 'Подтверждён',
  canceled: 'Отменён',
  closed: 'Закрыт',
}
const today = () => {
  const now = new Date()
  return new Date(+now - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
const emptyTransaction = () => ({
  requestKey: crypto.randomUUID(),
  type: 'income',
  category: 'client_payment',
  amount: '',
  date: today(),
  paymentMethod: 'transfer',
  comment: '',
  staffId: '',
})

function LocationOrder({ order, companyId, onChanged }) {
  const [transaction, setTransaction] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const summary = order.readiness?.summary || {}
  const headers = { 'x-partycrm-company-id': companyId }
  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { requestKey, ...payload } = transaction
      await apiJson('/api/party/location-transactions', {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': requestKey },
        body: JSON.stringify({
          ...payload,
          amount: Number(transaction.amount),
          date: new Date(transaction.date).toISOString(),
          orderId: order._id,
          ...(transaction.category === 'payout'
            ? { staffId: transaction.staffId }
            : { staffId: undefined }),
        }),
      })
      setTransaction(null)
      await onChanged(order._id)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const close = async () => {
    setBusy(true)
    setError('')
    try {
      await apiJson(`/api/party/location-orders/${order._id}/close`, {
        method: 'PATCH',
        headers,
        body: '{}',
      })
      await onChanged(order._id)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const categories = Object.entries(partyTransactionCategoryLabels).filter(
    ([key]) =>
      transaction?.type === 'income'
        ? ['deposit', 'final_payment', 'client_payment', 'other'].includes(key)
        : [
            'payout',
            'refund',
            'taxes',
            'materials',
            'travel',
            'other',
          ].includes(key)
  )
  return (
    <article className="space-y-4 rounded-xl border border-sky-100 bg-white p-4">
      <div>
        <h2 className="text-xl font-semibold">
          {order.title || 'Мероприятие'}
        </h2>
        <p className="text-sm text-slate-600">
          {order.locationTitle} · {date(order.eventDate)} ·{' '}
          {statuses[order.status] || order.status}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Сумма заказа', order.contractAmount],
          ['Получено', summary.incomeTotal],
          ['Остаток оплаты', summary.balanceDue],
          ['Осталось выплатить', summary.unpaidPayoutTotal],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-sky-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-semibold">{money(value)}</p>
          </div>
        ))}
      </div>
      <div className="text-sm">
        <p>
          Заказчик: {order.client?.name || 'Не указан'}
          {order.client?.phone ? ` · ${order.client.phone}` : ''}
        </p>
        <p>
          Услуги:{' '}
          {(order.services || []).map((service) => service.title).join(', ') ||
            'Не указаны'}
        </p>
      </div>
      <section>
        <h3 className="mb-2 font-semibold">Исполнители</h3>
        <div className="space-y-2">
          {(order.assignedStaff || []).map((person) => (
            <div
              key={person.staffId}
              className="flex flex-wrap justify-between gap-2 rounded bg-slate-50 p-2 text-sm"
            >
              <span>{person.name || 'Исполнитель'}</span>
              <span>Гонорар {money(person.payoutAmount)}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Движение денег по празднику</h3>
        {!order.transactions?.length && (
          <p className="text-sm text-slate-500">Операций пока нет.</p>
        )}
        <div className="space-y-2">
          {(order.transactions || []).map((item, index) => (
            <div
              key={item._id || index}
              className="rounded-lg border border-slate-100 p-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {partyTransactionCategoryLabels[item.category] ||
                    item.category}
                </span>
                <strong
                  className={
                    item.type === 'income'
                      ? 'text-emerald-700'
                      : 'text-slate-700'
                  }
                >
                  {item.type === 'income' ? '+' : '−'}
                  {money(item.amount)}
                </strong>
              </div>
              <p className="text-xs text-slate-500">
                {date(item.date)} ·{' '}
                {partyPaymentMethodLabels[item.paymentMethod] ||
                  item.paymentMethod}
              </p>
              {item.staffId && (
                <p>
                  {order.assignedStaff?.find(
                    (person) => String(person.staffId) === String(item.staffId)
                  )?.name || 'Исполнитель'}
                </p>
              )}
              {item.comment && (
                <p className="mt-1 whitespace-pre-wrap">{item.comment}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {!['closed', 'canceled'].includes(order.status) && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => {
                setError('')
                setTransaction(emptyTransaction())
              }}
            >
              Записать оплату или расход
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || !order.readiness?.ok}
              onClick={close}
            >
              Закрыть заказ
            </button>
          </div>
          {!order.readiness?.ok && (
            <ul className="list-disc pl-5 text-sm text-amber-800">
              {(order.readiness?.blockers || []).map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {transaction && (
        <Modal
          open={true}
          title="Операция по празднику"
          tone="party"
          size="md"
          onClose={() => setTransaction(null)}
          hasUnsavedChanges={Boolean(transaction.amount || transaction.comment)}
        >
          <form className="space-y-3" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Тип операции
                <select
                  className={control}
                  value={transaction.type}
                  onChange={(event) =>
                    setTransaction({
                      ...transaction,
                      type: event.target.value,
                      category:
                        event.target.value === 'income'
                          ? 'client_payment'
                          : 'other',
                      staffId: '',
                    })
                  }
                >
                  <option value="income">Поступление</option>
                  <option value="expense">Расход</option>
                </select>
              </label>
              <label className="text-sm">
                Назначение
                <select
                  className={control}
                  value={transaction.category}
                  onChange={(event) =>
                    setTransaction({
                      ...transaction,
                      category: event.target.value,
                    })
                  }
                >
                  {categories.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {transaction.category === 'payout' && (
              <label className="block text-sm">
                Исполнитель
                <select
                  required
                  className={control}
                  value={transaction.staffId}
                  onChange={(event) =>
                    setTransaction({
                      ...transaction,
                      staffId: event.target.value,
                    })
                  }
                >
                  <option value="">Выберите исполнителя</option>
                  {(order.assignedStaff || []).map((person) => (
                    <option key={person.staffId} value={person.staffId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Сумма
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={control}
                  value={transaction.amount}
                  onChange={(event) =>
                    setTransaction({
                      ...transaction,
                      amount: event.target.value,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Дата и время
                <input
                  required
                  type="datetime-local"
                  className={control}
                  value={transaction.date}
                  onChange={(event) =>
                    setTransaction({ ...transaction, date: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="block text-sm">
              Способ
              <select
                className={control}
                value={transaction.paymentMethod}
                onChange={(event) =>
                  setTransaction({
                    ...transaction,
                    paymentMethod: event.target.value,
                  })
                }
              >
                {Object.entries(partyPaymentMethodLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Комментарий
              <textarea
                className={control}
                value={transaction.comment}
                maxLength={1000}
                onChange={(event) =>
                  setTransaction({
                    ...transaction,
                    comment: event.target.value,
                  })
                }
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className={button}>
              {busy ? 'Сохранение…' : 'Записать операцию'}
            </button>
          </form>
        </Modal>
      )}
    </article>
  )
}

export default function PartyLocationWorkspace({ companies }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [filters, setFilters] = useState({
    locationId: '',
    status: '',
    from: '',
    to: '',
  })
  const [data, setData] = useState({
    locations: [],
    orders: [],
    total: 0,
    nextCursor: null,
  })
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useCallback(
    (path, options = {}) =>
      apiJson(path, {
        ...options,
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
      }),
    [companyId]
  )
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value)
      .map(([key, value]) => [
        key,
        key === 'from'
          ? new Date(`${value}T00:00:00`).toISOString()
          : key === 'to'
            ? new Date(`${value}T23:59:59.999`).toISOString()
            : value,
      ])
  ).toString()
  useEffect(() => {
    const controller = new AbortController()
    request(`/api/party/location-workspace?${query}`, {
      signal: controller.signal,
    })
      .then((json) => setData(json.data))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [request, query])
  useEffect(() => {
    window.localStorage.setItem('partycrm.activeCompanyId', companyId)
    window.dispatchEvent(new Event('partycrm:profile-updated'))
  }, [companyId])
  const loadOrder = async (id) => {
    setBusy(true)
    setError('')
    try {
      const json = await request(`/api/party/location-orders/${id}`)
      setSelected(json.data)
      setData((previous) => ({
        ...previous,
        orders: previous.orders.map((order) =>
          order._id === id ? json.data : order
        ),
      }))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const more = async () => {
    setBusy(true)
    setError('')
    try {
      const json = await request(
        `/api/party/location-workspace?${query}&cursor=${data.nextCursor}`
      )
      setData((previous) => ({
        ...json.data,
        orders: [...previous.orders, ...json.data.orders],
      }))
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const exportCsv = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/party/location-finance/export?${query}`,
        { headers: { 'x-partycrm-company-id': companyId } }
      )
      if (!response.ok) {
        const json = await response.json()
        throw new Error(json.error?.message || 'Не удалось выгрузить операции')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'finansy-ploshchadok.csv'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const changeFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value }))
    setSelected(null)
    setError('')
  }
  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Мои площадки</h1>
      <p className="text-sm text-slate-600">
        Заявки, проведённые праздники и деньги доступных вам площадок.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Компания
          <select
            className={control}
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value)
              setFilters({ locationId: '', status: '', from: '', to: '' })
              setData({ locations: [], orders: [], total: 0, nextCursor: null })
              setSelected(null)
              setError('')
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Площадка
          <select
            className={control}
            value={filters.locationId}
            onChange={(event) => changeFilter('locationId', event.target.value)}
          >
            <option value="">Все доступные</option>
            {data.locations.map((location) => (
              <option key={location._id} value={location._id}>
                {location.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Статус
          <select
            className={control}
            value={filters.status}
            onChange={(event) => changeFilter('status', event.target.value)}
          >
            <option value="">Все</option>
            {Object.entries(statuses).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          С даты
          <input
            type="date"
            className={control}
            value={filters.from}
            onChange={(event) => changeFilter('from', event.target.value)}
          />
        </label>
        <label className="text-sm">
          По дату
          <input
            type="date"
            className={control}
            value={filters.to}
            onChange={(event) => changeFilter('to', event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Найдено заказов: {data.total}</p>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={exportCsv}
        >
          Выгрузить финансы CSV
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          {data.orders.map((order) => (
            <button
              type="button"
              key={order._id}
              disabled={busy}
              className={`w-full cursor-pointer rounded-lg border p-3 text-left ${selected?._id === order._id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
              onClick={() => loadOrder(order._id)}
            >
              <strong className="block text-sm">
                {order.title || 'Мероприятие'}
              </strong>
              <p className="text-xs text-slate-600">
                {order.locationTitle} · {date(order.eventDate)}
              </p>
              <p className="mt-1 text-sm">
                {statuses[order.status]} · {money(order.contractAmount)}
              </p>
            </button>
          ))}
          {!data.orders.length && !error && (
            <p className="text-sm text-slate-500">
              По выбранным условиям заказов нет.
            </p>
          )}
          {data.nextCursor && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={more}
            >
              Показать ещё
            </button>
          )}
        </div>
        <div className="min-w-0">
          {selected ? (
            <LocationOrder
              key={`${companyId}:${selected._id}`}
              order={selected}
              companyId={companyId}
              onChanged={loadOrder}
            />
          ) : (
            <p className="rounded-xl bg-white p-5 text-sm text-slate-500">
              Выберите праздник, чтобы посмотреть операции и расчёты.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
