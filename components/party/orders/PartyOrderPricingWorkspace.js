'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const buttonClass =
  'cursor-pointer rounded border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50'
const dateText = (value) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleString('ru-RU')
}

function OrderPricingEditor({ companyId, orderId, onSaved }) {
  const [order, setOrder] = useState(null)
  const [amount, setAmount] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warnings, setWarnings] = useState([])
  const controller = useRef(null)
  const submitting = useRef(false)
  const request = useCallback(
    (options = {}) => apiJson(`/api/party/orders/${orderId}/pricing`, {
      ...options,
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': companyId },
    }),
    [companyId, orderId]
  )
  const refresh = useCallback(async () => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setLoading(true)
    setError('')
    setNotice('')
    setWarnings([])
    setAcknowledged(false)
    try {
      const response = await request({ signal: current.signal })
      if (current.signal.aborted) return
      setOrder(response.data)
      setAmount(String(response.data.contractAmount ?? 0))
      setNeedsRefresh(false)
    } catch (failure) {
      if (current.signal.aborted) return
      setNeedsRefresh(true)
      setError(failure.message)
    } finally {
      if (!current.signal.aborted) setLoading(false)
    }
  }, [request])
  useEffect(() => {
    refresh()
    return () => controller.current?.abort()
  }, [refresh])

  const validAmount = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount))
  const clearsComposition = Boolean(order?.hasOrderItems || order?.hasAgreedProposal)
  const editable = order && ['draft', 'active'].includes(order.status)
  const canSave = editable && validAmount && Number(amount) !== order.contractAmount &&
    (!clearsComposition || acknowledged) && !loading && !saving && !needsRefresh

  const save = async (event) => {
    event.preventDefault()
    if (!canSave || submitting.current) return
    submitting.current = true
    const current = new AbortController()
    controller.current = current
    setSaving(true)
    setError('')
    setNotice('')
    setWarnings([])
    try {
      const response = await request({
        method: 'PATCH',
        signal: current.signal,
        body: JSON.stringify({
          contractAmount: Number(amount),
          expectedRevision: order.commercialRevision,
        }),
      })
      if (current.signal.aborted) return
      setOrder(response.data)
      setAmount(String(response.data.contractAmount ?? 0))
      setAcknowledged(false)
      setNotice('Стоимость сохранена.')
      setWarnings(Array.isArray(response.data.warnings) ? response.data.warnings.filter((warning) => typeof warning === 'string') : [])
      onSaved(response.data)
    } catch (failure) {
      if (current.signal.aborted) return
      setNeedsRefresh(true)
      setAcknowledged(false)
      setError(`${failure.message}. Обновите данные заказа перед повторным сохранением.`)
    } finally {
      submitting.current = false
      if (!current.signal.aborted) setSaving(false)
    }
  }

  return (
    <section className="min-w-0 space-y-3 rounded border bg-white p-4" aria-label="Изменение стоимости">
      <h2 className="text-lg font-semibold">Изменение стоимости</h2>
      {loading ? <p role="status">Загрузка заказа…</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-green-700">{notice}</p> : null}
      {warnings.map((warning, index) => <p key={index} role="status" className="text-sm text-amber-800">{warning}</p>)}
      <button type="button" className={buttonClass} disabled={loading || saving} onClick={refresh}>
        Обновить данные заказа
      </button>
      {order ? (
        <form onSubmit={save} className="space-y-3">
          <p className="break-words font-medium">{order.title || order.serviceTitle || 'Заказ'}</p>
          <p className="text-sm text-gray-600">{dateText(order.eventDate)}</p>
          {!editable ? <p role="status">Стоимость закрытого или отменённого заказа нельзя изменить.</p> : null}
          <label className="block text-sm font-medium">
            Стоимость заказа, ₽
            <input className="mt-1 block w-full rounded border p-2" inputMode="numeric"
              value={amount} disabled={!editable || loading || saving || needsRefresh}
              onChange={(event) => { setAmount(event.target.value); setNotice('') }} />
          </label>
          {!validAmount ? <p className="text-sm text-red-700">Введите целое число рублей, не меньше нуля.</p> : null}
          {clearsComposition ? (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p>Изменение стоимости сбросит детализацию стоимости и снимет связь с согласованным предложением. Выбранные услуги сохранятся; новая сумма станет общей стоимостью заказа.</p>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1 cursor-pointer" checked={acknowledged}
                  disabled={loading || saving || needsRefresh}
                  onChange={(event) => setAcknowledged(event.target.checked)} />
                <span>Подтверждаю изменение общей стоимости, сброс детализации и связи с согласованным предложением</span>
              </label>
            </div>
          ) : null}
          <button type="submit" className={`${buttonClass} bg-blue-600 text-white`} disabled={!canSave}>
            {saving ? 'Сохранение…' : 'Сохранить стоимость'}
          </button>
        </form>
      ) : null}
    </section>
  )
}

function PricingCompany({ companyId }) {
  const [orders, setOrders] = useState([])
  const [cursor, setCursor] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef(null)
  const load = useCallback(async (next = '') => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setLoading(true)
    setError('')
    try {
      const response = await apiJson(`/api/party/order-pricing${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, {
        cache: 'no-store', signal: current.signal,
        headers: { 'x-partycrm-company-id': companyId },
      })
      if (current.signal.aborted) return
      setOrders((previous) => next ? Array.from(new Map([...previous, ...response.data.orders].map((order) => [order._id, order])).values()) : response.data.orders)
      setCursor(response.data.nextCursor || '')
    } catch (failure) {
      if (!current.signal.aborted) setError(failure.message)
    } finally {
      if (!current.signal.aborted) setLoading(false)
    }
  }, [companyId])
  useEffect(() => {
    load()
    return () => controller.current?.abort()
  }, [load])
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <section className="min-w-0 space-y-3" aria-label="Заказы для изменения стоимости">
        <h2 className="font-semibold">Заказы</h2>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button type="button" className={buttonClass} disabled={loading} onClick={() => load()}>Обновить список</button>
        <ul className="space-y-2">
          {orders.map((order) => (
            <li key={order._id}>
              <button type="button" className={`${buttonClass} w-full break-words text-left ${selectedId === order._id ? 'border-blue-600 bg-blue-50' : 'bg-white'}`}
                aria-pressed={selectedId === order._id} onClick={() => setSelectedId(order._id)}>
                <span className="block font-medium">{order.title || order.serviceTitle || 'Заказ'}</span>
                <span className="block text-gray-600">{dateText(order.eventDate)}</span>
                <span className="block">{Number(order.contractAmount || 0).toLocaleString('ru-RU')} ₽</span>
              </button>
            </li>
          ))}
        </ul>
        {loading ? <p role="status">Загрузка заказов…</p> : null}
        {!loading && !error && !orders.length ? <p>Нет доступных заказов.</p> : null}
        {cursor ? <button type="button" className={buttonClass} disabled={loading} onClick={() => load(cursor)}>Загрузить ещё</button> : null}
      </section>
      {selectedId ? (
        <OrderPricingEditor key={selectedId} companyId={companyId} orderId={selectedId}
          onSaved={(saved) => setOrders((previous) => previous.map((order) => order._id === saved._id ? saved : order))} />
      ) : <p className="text-sm text-gray-600">Выберите заказ, чтобы изменить его стоимость.</p>}
    </div>
  )
}

export default function PartyOrderPricingWorkspace({ companies = [] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id || '')
  const activeCompanyId = companies.some((company) => company.id === selectedCompanyId)
    ? selectedCompanyId : companies[0]?.id || ''
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-3 sm:p-6">
      <h1 className="text-xl font-semibold">Стоимость заказов</h1>
      <p className="text-sm text-gray-600">Изменяйте общую стоимость открытых заказов компании.</p>
      {companies.length > 1 ? (
        <label className="block max-w-md text-sm font-medium">Компания
          <select className="mt-1 w-full cursor-pointer rounded border bg-white p-2" value={activeCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
          </select>
        </label>
      ) : companies[0] ? <p className="text-sm font-medium">{companies[0].title}</p> : null}
      {activeCompanyId ? <PricingCompany key={activeCompanyId} companyId={activeCompanyId} />
        : <p role="status">Нет компаний с доступом к изменению стоимости.</p>}
    </div>
  )
}
