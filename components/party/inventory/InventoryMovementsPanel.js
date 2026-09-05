'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { apiJson } from '@helpers/apiClient'

const empty = {
  operation: 'issue',
  resourceId: '',
  orderId: '',
  fromStaffId: '',
  toStaffId: '',
  quantity: 1,
  expectedReturnAt: '',
  condition: 'ok',
  comment: '',
}
const kinds = { issue: 'Выдача', transfer: 'Передача', return: 'Возврат' }
const conditions = {
  ok: 'В порядке',
  needs_cleaning: 'Нужна стирка / чистка',
  damaged: 'Нужен ремонт',
}
const dateText = (value) =>
  value ? new Date(value).toLocaleString('ru-RU') : 'Срок не указан'
const localDate = (value) =>
  value
    ? new Date(+new Date(value) - new Date(value).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : ''
const selectClass =
  'mt-1 w-full cursor-pointer rounded border bg-white p-2 text-sm'

export default function InventoryMovementsPanel({
  activeCompanyId,
  orderId = '',
  onChanged,
}) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ ...empty, orderId })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(null)
  const submitting = useRef(false)
  const request = useCallback(
    (options = {}, cursor = '') =>
      apiJson(
        `/api/party/inventory/movements?${new URLSearchParams({ ...(orderId ? { orderId } : {}), ...(cursor ? { cursor } : {}) })}`,
        {
          ...options,
          cache: 'no-store',
          headers: { 'x-partycrm-company-id': activeCompanyId },
        }
      ),
    [activeCompanyId, orderId]
  )
  useEffect(() => {
    let alive = true
    setData(null)
    setError('')
    setForm({ ...empty, orderId })
    pending.current = null
    request()
      .then((response) => {
        if (alive) setData(response.data)
      })
      .catch((failure) => {
        if (alive) setError(failure.message)
      })
    return () => {
      alive = false
    }
  }, [request, orderId])
  const reload = async () => setData((await request()).data)
  const update = (patch) => setForm((current) => ({ ...current, ...patch }))
  const fromHolding = (holding, operation) =>
    setForm({
      ...empty,
      operation,
      resourceId: String(holding.resourceId),
      orderId: String(holding.orderId),
      fromStaffId: String(holding.holderStaffId),
      quantity: holding.quantity,
      expectedReturnAt: localDate(holding.expectedReturnAt),
    })
  const submit = async (event) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        expectedReturnAt: form.expectedReturnAt
          ? new Date(form.expectedReturnAt).toISOString()
          : null,
      }
      const fingerprint = JSON.stringify(payload)
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, idempotencyKey: crypto.randomUUID() }
      const response = await request({
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          idempotencyKey: pending.current.idempotencyKey,
        }),
      })
      pending.current = null
      setNotice(
        response.data.repeated
          ? 'Эта операция уже записана; повторного движения нет.'
          : 'Движение записано в журнал.'
      )
      setForm({ ...empty, orderId })
      await reload()
      await onChanged?.()
    } catch (failure) {
      setError(failure.message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  const loadMore = async () => {
    setBusy(true)
    try {
      const response = await request({}, data.nextCursor)
      setData((current) => ({
        ...current,
        movements: [...current.movements, ...response.data.movements],
        nextCursor: response.data.nextCursor,
      }))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const selectedItem = data?.items.find(
    (item) => String(item._id) === form.resourceId
  )
  const sourceHoldings =
    data?.holdings.filter(
      (holding) =>
        String(holding.resourceId) === form.resourceId &&
        String(holding.orderId) === form.orderId
    ) || []
  return (
    <section className="space-y-4 rounded-xl border bg-white p-4">
      <h3 className="text-lg font-semibold">Выдача и возврат</h3>
      <p className="text-sm text-gray-600">
        Снятие брони не возвращает вещи на склад. Обещанный срок возврата не
        освобождает количество автоматически.
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-800">
          {notice}
        </p>
      )}
      {!data ? (
        <p className="text-sm" role="status">
          Загрузка движений…
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <h4 className="font-semibold">У сотрудников</h4>
            {data.holdings.length === 0 && (
              <p className="text-sm text-gray-500">Выданного реквизита нет.</p>
            )}
            {data.holdings.map((holding) => (
              <div className="rounded-lg border p-3 text-sm" key={holding._id}>
                <strong>
                  {data.items.find(
                    (item) => String(item._id) === String(holding.resourceId)
                  )?.title || 'Реквизит'}{' '}
                  · {holding.quantity}
                </strong>
                <div>
                  {holding.holderName} · {holding.orderTitle}
                </div>
                <div
                  className={
                    holding.expectedReturnAt &&
                    +new Date(holding.expectedReturnAt) < Date.now()
                      ? 'text-red-700'
                      : 'text-gray-500'
                  }
                >
                  Возврат: {dateText(holding.expectedReturnAt)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="small"
                    disabled={busy}
                    onClick={() => fromHolding(holding, 'return')}
                  >
                    Вернуть полностью или частично
                  </Button>
                  <Button
                    type="button"
                    size="small"
                    disabled={busy}
                    onClick={() => fromHolding(holding, 'transfer')}
                  >
                    Передать сотруднику
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={submit}
            className="space-y-3 rounded-lg bg-gray-50 p-3"
          >
            <fieldset disabled={busy} className="space-y-3">
              <legend className="mb-2 font-semibold">Новое движение</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Операция
                  <select
                    className={selectClass}
                    value={form.operation}
                    aria-label="Операция"
                    onChange={(event) =>
                      update({ operation: event.target.value, condition: 'ok' })
                    }
                  >
                    {Object.entries(kinds).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {!orderId && (
                  <label className="text-sm">
                    Заказ
                    <select
                      required
                      className={selectClass}
                      value={form.orderId}
                      aria-label="Заказ"
                      onChange={(event) =>
                        update({ orderId: event.target.value, fromStaffId: '' })
                      }
                    >
                      <option value="">Выберите заказ</option>
                      {data.orders.map((order) => (
                        <option key={order._id} value={order._id}>
                          {order.title || order.serviceTitle || 'Заказ'} ·{' '}
                          {new Date(order.eventDate).toLocaleDateString(
                            'ru-RU'
                          )}
                        </option>
                      ))}
                      {form.orderId &&
                        !data.orders.some(
                          (order) => String(order._id) === form.orderId
                        ) && (
                          <option value={form.orderId}>
                            Удалённый заказ · {form.orderId.slice(-6)}
                          </option>
                        )}
                    </select>
                  </label>
                )}
                <label className="text-sm">
                  Реквизит
                  <select
                    required
                    className={selectClass}
                    value={form.resourceId}
                    aria-label="Реквизит"
                    onChange={(event) =>
                      update({
                        resourceId: event.target.value,
                        fromStaffId: '',
                      })
                    }
                  >
                    <option value="">Выберите позицию</option>
                    {data.items
                      .filter(
                        (item) =>
                          form.operation !== 'issue' || item.status === 'active'
                      )
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title} · на складе доступно {item.freeQuantity}
                        </option>
                      ))}
                  </select>
                </label>
                <TextField
                  size="small"
                  label="Количество"
                  type="number"
                  required
                  inputProps={{ min: 1, step: 1 }}
                  value={form.quantity}
                  onChange={(event) => update({ quantity: event.target.value })}
                />
                {form.operation !== 'issue' && (
                  <label className="text-sm">
                    У кого забираем
                    <select
                      required
                      className={selectClass}
                      value={form.fromStaffId}
                      aria-label="У кого забираем"
                      onChange={(event) =>
                        update({ fromStaffId: event.target.value })
                      }
                    >
                      <option value="">Выберите держателя</option>
                      {sourceHoldings.map((holding) => (
                        <option key={holding._id} value={holding.holderStaffId}>
                          {holding.holderName} · у него {holding.quantity}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {form.operation !== 'return' && (
                  <label className="text-sm">
                    Кому передаём
                    <select
                      required
                      className={selectClass}
                      value={form.toStaffId}
                      aria-label="Кому передаём"
                      onChange={(event) =>
                        update({ toStaffId: event.target.value })
                      }
                    >
                      <option value="">Выберите сотрудника</option>
                      {data.staff
                        .filter(
                          (person) =>
                            person.status === 'active' &&
                            String(person._id) !== form.fromStaffId
                        )
                        .map((person) => (
                          <option key={person._id} value={person._id}>
                            {person.title}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {form.operation !== 'return' && (
                  <TextField
                    size="small"
                    label="Ожидаемый возврат"
                    type="datetime-local"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={form.expectedReturnAt}
                    onChange={(event) =>
                      update({ expectedReturnAt: event.target.value })
                    }
                  />
                )}
                {form.operation === 'return' && (
                  <label className="text-sm">
                    Состояние возвращаемой части
                    <select
                      className={selectClass}
                      value={form.condition}
                      aria-label="Состояние возвращаемой части"
                      onChange={(event) =>
                        update({ condition: event.target.value })
                      }
                    >
                      {Object.entries(conditions).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {selectedItem && (
                <p className="text-sm text-gray-600">
                  Всего {selectedItem.quantity}; у сотрудников{' '}
                  {selectedItem.heldQuantity}; в офисе{' '}
                  {selectedItem.physicalQuantity}; из них доступны{' '}
                  {selectedItem.freeQuantity}.
                </p>
              )}
              <TextField
                fullWidth
                size="small"
                multiline
                minRows={2}
                label="Комментарий / что требует внимания"
                required={form.condition !== 'ok'}
                value={form.comment}
                inputProps={{ maxLength: 2000 }}
                onChange={(event) => update({ comment: event.target.value })}
              />
              {form.condition !== 'ok' && (
                <p className="text-sm text-amber-800">
                  Возвращённое количество будет недоступно до восстановления.
                  Состояние разных частей оформляйте отдельными возвратами.
                </p>
              )}
              <Button type="submit" variant="contained">
                Записать движение
              </Button>
            </fieldset>
          </form>
          <div className="space-y-2">
            <h4 className="font-semibold">Журнал</h4>
            {!data.movements.length && (
              <p className="text-sm text-gray-500">Движений пока нет.</p>
            )}
            {data.movements.map((movement) => (
              <article
                key={movement._id}
                className="rounded-lg border p-3 text-sm"
              >
                <strong>
                  {kinds[movement.operation]} · {movement.resourceTitle} ·{' '}
                  {movement.quantity}
                </strong>
                <div>
                  {movement.fromStaffName || 'Склад'} →{' '}
                  {movement.toStaffName || 'Склад'} · {movement.orderTitle}
                </div>
                <div>
                  {dateText(movement.createdAt)} · записал:{' '}
                  {movement.actorStaffName}
                </div>
                {movement.condition !== 'ok' && (
                  <div className="text-amber-800">
                    {conditions[movement.condition]}
                  </div>
                )}
                {movement.comment && (
                  <p className="whitespace-pre-wrap">{movement.comment}</p>
                )}
              </article>
            ))}
            {data.nextCursor && (
              <Button type="button" disabled={busy} onClick={loadMore}>
                Показать предыдущие движения
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
