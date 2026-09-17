'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyGroupPayments from './PartyGroupPayments'
import PartyLegacyLedger from './PartyLegacyLedger'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'
const money = value => `${Number(value || 0).toLocaleString('ru-RU')} ₽`
const dateLabel = value => value ? new Date(value).toLocaleString('ru-RU') : 'Дата не задана'
const statusLabel = { draft: 'Черновик', active: 'Активен', canceled: 'Отменён', closed: 'Закрыт' }
const financeLabels = { contractAmount: 'Договор', incomeTotal: 'Поступило', expenseTotal: 'Расходы', balanceDue: 'Остаток к оплате' }

function RelatedOrders({ companyId, orderId, onChanged }) {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [targetId, setTargetId] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestRef = useRef(null)
  const endpoint = `/api/party/orders/${orderId}/related-orders`
  const headers = { 'x-partycrm-company-id': companyId }
  const load = useCallback(async (term = '') => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true); setError('')
    try {
      const { data: next } = await apiJson(`${endpoint}?${new URLSearchParams({ search: term })}`, { cache: 'no-store', signal: controller.signal, headers: { 'x-partycrm-company-id': companyId } })
      if (controller.signal.aborted) return
      setData(next); setTargetId('')
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [endpoint, companyId])
  useEffect(() => { load(); return () => requestRef.current?.abort() }, [load])
  const mutate = async method => {
    setSaving(true); setError(''); setMessage('')
    try {
      await apiJson(endpoint, { method, headers, body: JSON.stringify({ expectedRevision: data?.group?.revision || 0, ...(method === 'POST' ? { targetOrderId: targetId, title } : {}), ...(method === 'PATCH' ? { sharedLocationBooking: !data.group.sharedLocationBooking } : {}) }) })
      setMessage(method === 'PATCH' ? 'Настройка общей брони сохранена.' : method === 'POST' ? 'Заказы связаны. Расчёты каждой части сохранены.' : 'Заказ отсоединён. Его расчёты и резервы сохранены.')
      await load(search)
      await onChanged?.()
    } catch (cause) { setError(cause.message) }
    finally { setSaving(false) }
  }
  const busy = loading || saving
  return <section className="space-y-4" aria-label="Связанные части праздника">
    <p className="text-sm text-slate-600">Объедините существующие заказы одного праздника. Каждая часть сохраняет свои суммы, платежи и ресурсы. Общая сводка не создаёт дополнительных начислений.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {data?.group && <div className="space-y-3 rounded-xl border border-sky-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="break-words font-semibold">{data.group.title}</h3><button type="button" className={button} disabled={busy} onClick={() => mutate('DELETE')}>Отсоединить этот заказ</button></div>
      <dl className="grid grid-cols-2 gap-3">{Object.entries(financeLabels).map(([key,label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold">{money(data.group.totals?.[key])}</dd></div>)}</dl>
      <p className="text-xs text-slate-500">Договор и долг отменённых частей исключены из итога; их фактические поступления и расходы сохранены. Остаток считается отдельно по каждой части — переплата одной не погашает долг другой.</p>
      <div className="space-y-2">{(data.group.orders || []).map(order => <article key={order._id} className="rounded-lg border border-slate-200 p-3 text-sm">
        <h4 className="break-words font-semibold">{order.title || 'Заказ'}{String(order._id) === String(orderId) ? ' · текущий' : ''}</h4>
        <p className="text-xs text-slate-500">{dateLabel(order.eventDate)} · {statusLabel[order.status] || order.status}</p>
        <p className="mt-1 break-words">Площадка: {order.locationTitle || 'Не указана'} · Плательщик: {order.payerName || 'Не указан'}</p>
        <dl className="mt-2 grid grid-cols-2 gap-2">{Object.entries(financeLabels).map(([key,label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd>{money(order.finance?.[key])}</dd></div>)}</dl>
        <div className="mt-3"><PartyLegacyLedger companyId={companyId} orderId={String(order._id)} onChanged={async () => { await load(search); await onChanged?.() }} /></div>
      </article>)}</div>
      <div className="space-y-2 rounded-lg bg-sky-50 p-3">
        <p className="text-sm font-medium">Общая бронь площадки: {data.group.sharedLocationBooking ? 'включена' : 'выключена'}</p>
        <p className="text-xs text-slate-600">При включении части этой группы могут пересекаться на одной площадке. Другие праздники по-прежнему конфликтуют с каждой занятой частью времени. Исполнители и реквизит проверяются отдельно. Время между частями не резервируется.</p>
        <button type="button" className={button} disabled={busy} onClick={() => mutate('PATCH')}>{data.group.sharedLocationBooking ? 'Выключить общую бронь' : 'Включить общую бронь'}</button>
        <p className="text-xs text-slate-600">Если части пересекаются на одной площадке, перед выключением общей брони или отсоединением измените время, площадку либо отмените часть.</p>
      </div>
      <p className="text-xs text-slate-500">Изменяйте расчёты в соответствующем заказе. Общая бронь не объединяет платежи.</p>
    </div>}
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <legend className="mb-2 font-medium">{data?.group ? 'Добавить часть праздника' : 'Связать с другим заказом'}</legend>
      {!data?.group && <label className="block text-sm">Название праздника<input className={control} value={title} maxLength={180} onChange={event => setTitle(event.target.value)} placeholder="Например: день рождения Маши" /></label>}
      <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm">Поиск заказа<input className={control} value={search} maxLength={120} onChange={event => setSearch(event.target.value)} placeholder="Название заказа" /></label><button type="button" className={button} onClick={() => load(search)}>Найти / обновить</button></div>
      <label className="block text-sm">Заказ для связывания<select className={`${control} cursor-pointer`} value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Выберите заказ</option>{(data?.candidates || []).map(order => <option key={order._id} value={order._id}>{dateLabel(order.eventDate)} · {order.title || 'Заказ'}</option>)}</select></label>
      <p className="text-xs text-slate-500">Показано до 50 последних подходящих заказов. Для старого заказа воспользуйтесь поиском. Отменённые и уже связанные заказы не предлагаются. До 20 частей в одном празднике.</p>
      <button type="button" className={button} disabled={busy || !targetId || !data} onClick={() => mutate('POST')}>Связать заказы</button>
    </fieldset>
    {busy && <p role="status" className="text-sm text-slate-500">{saving ? 'Сохранение…' : 'Загрузка…'}</p>}
    {data && <PartyGroupPayments companyId={companyId} orderId={orderId} group={data.group} onChanged={async () => { await load(search); await onChanged?.() }} />}
  </section>
}
export default function PartyRelatedOrders(props) { return <RelatedOrders key={`${props.companyId}:${props.orderId}`} {...props} /> }
