'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyGroupPaymentCorrection from './PartyGroupPaymentCorrection'
import { PARTY_ORDER_PAYMENT_METHOD_LABELS, PARTY_ORDER_TRANSACTION_CATEGORY_LABELS } from '@helpers/partyOrderTransactions'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'
const money = value => `${Number(value || 0).toLocaleString('ru-RU')} ₽`
const cents = value => {
  const text = String(value).trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : null
}
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function GroupPayments({ companyId, orderId, group, onChanged }) {
  const [amount, setAmount] = useState('')
  const [allocations, setAllocations] = useState({})
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('deposit')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [comment, setComment] = useState('')
  const [payments, setPayments] = useState([])
  const [pending, setPending] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const endpoint = `/api/party/orders/${orderId}/group-payments`
  const storageKey = `party-group-payment:${companyId}:${orderId}`
  const load = useCallback(async signal => {
    const result = await apiJson(endpoint, { signal, cache: 'no-store', headers: { 'x-partycrm-company-id': companyId } })
    if (!signal?.aborted) setPayments(result.data?.payments || [])
  }, [endpoint, companyId])
  useEffect(() => {
    const controller = new AbortController()
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setPending(JSON.parse(saved))
      setReady(true)
    } catch { setError('Не удалось восстановить незавершённый платёж. Проверьте доступность хранилища браузера.') }
    load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [load, storageKey])
  const activeOrders = (group?.orders || []).filter(order => ['draft', 'active'].includes(order.status))
  const selected = activeOrders.map(order => ({ orderId: order._id, amountCents: cents(allocations[order._id] || '0') })).filter(item => item.amountCents !== 0)
  const total = cents(amount)
  const allocated = selected.reduce((sum, item) => sum + (item.amountCents || 0), 0)
  const valid = group && selected.length >= 2 && selected.every(item => item.amountCents >= 100) && total >= 200 && total === allocated && date
  const save = async () => {
    if (inFlight.current || (!pending && !valid)) return
    inFlight.current = true
    setBusy(true); setError(''); setMessage('')
    let payload = pending
    let confirmed = false
    try {
      if (!payload) {
        payload = { idempotencyKey: crypto.randomUUID(), expectedRevision: group.revision,
          amount: total / 100, allocations: selected.map(item => ({ orderId: item.orderId, amount: item.amountCents / 100 })),
          date, category, paymentMethod, comment }
        // Persist before sending: closing the modal must not turn a retry into a new receipt.
        sessionStorage.setItem(storageKey, JSON.stringify(payload))
        setPending(payload)
      }
      const result = await apiJson(endpoint, { method: 'POST', headers: { 'x-partycrm-company-id': companyId }, body: JSON.stringify(payload) })
      confirmed = true
      setMessage(`Поступление сохранено: ${money(result.data.payment.amount)}.${result.data.replayed ? ' Повторный запрос не создал новых операций.' : ''} ${(result.data.warnings || []).join(' ')}`)
      sessionStorage.removeItem(storageKey)
      setPending(null); setAmount(''); setAllocations({}); setComment('')
      await load()
      await onChanged?.()
    } catch (cause) {
      // A definitive validation refusal permits correction; uncertain responses keep the exact request.
      if (!confirmed && cause.status >= 400 && cause.status < 500) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
      setError(confirmed ? `Поступление сохранено, но не удалось обновить экран: ${cause.message}` : cause.message)
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3" aria-label="Общие поступления">
    <h3 className="font-semibold">Общие поступления</h3>
    <p className="text-sm text-slate-600">Внесите новый платёж один раз и укажите долю каждой части праздника. Уже записанный платёж повторно здесь не вносите.</p>
    {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {pending && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm"><p>Проверить сохранение платежа на {money(pending.amount)}. Повтор отправит те же данные с защитой от дубликатов.</p><button type="button" className={button} disabled={busy || !ready} onClick={save}>Повторить сохранение платежа</button></div>}
    {group && <fieldset className="min-w-0 space-y-3" disabled={busy || Boolean(pending) || !ready}>
      <legend className="mb-2 font-medium">Новое поступление на несколько заказов</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Общая сумма, ₽<input className={control} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label className="text-sm">Дата поступления<input type="date" className={control} value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="text-sm">Способ оплаты<select className={`${control} cursor-pointer`} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}>{Object.entries(PARTY_ORDER_PAYMENT_METHOD_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="text-sm">Назначение<select className={`${control} cursor-pointer`} value={category} onChange={event => setCategory(event.target.value)}>{['deposit','final_payment','client_payment'].map(key => <option key={key} value={key}>{PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[key]}</option>)}</select></label>
      </div>
      {activeOrders.map(order => <label key={order._id} className="block break-words text-sm">{order.title || 'Заказ'} — доля, ₽<input className={control} inputMode="decimal" value={allocations[order._id] || ''} onChange={event => setAllocations(current => ({ ...current, [order._id]: event.target.value }))} /><span className="text-xs text-slate-500">Остаток к оплате: {money(order.finance?.balanceDue)}</span></label>)}
      <p className="text-sm">Распределено: {money(allocated / 100)}. Не распределено: {money(((total || 0) - allocated) / 100)}.</p>
      <p className="text-xs text-slate-500">Не менее двух открытых заказов, от 1 ₽ на часть, до двух знаков после запятой. Сумма долей должна совпасть с платежом. Пустая доля не включается.</p>
      <label className="block text-sm">Комментарий к поступлению<textarea className={control} maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} /></label>
      <button type="button" className={button} disabled={busy || !valid || Boolean(pending) || !ready} onClick={save}>Сохранить общее поступление</button>
    </fieldset>}
    <p className="text-xs text-slate-500">Доли общего платежа нельзя редактировать или удалять по отдельности. Фактический возврат оформляется отдельным расходом соответствующего заказа.</p>
    <h4 className="text-sm font-medium">История общих поступлений</h4>
    <p className="text-xs text-slate-500">До 50 последних поступлений группы и этого заказа, включая историю после отсоединения.</p>
    {!payments.length && <p className="text-sm text-slate-500">Общих поступлений пока нет.</p>}
    {payments.map(payment => <article key={payment._id} className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
      <p className="font-medium">{money(payment.amount)} · {new Date(payment.date).toLocaleDateString('ru-RU')}</p>
      <p>{PARTY_ORDER_PAYMENT_METHOD_LABELS[payment.paymentMethod]} · {PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[payment.category]}</p>
      {payment.allocations.map(item => <p key={item.orderId} className="break-words">{item.orderTitle || 'Заказ'}: {money(item.amount)}</p>)}
      {payment.comment && <p className="whitespace-pre-wrap break-words text-slate-600">{payment.comment}</p>}
      <PartyGroupPaymentCorrection companyId={companyId} orderId={orderId} payment={payment} onChanged={async () => { await load(); await onChanged?.() }} />
    </article>)}
  </section>
}

export default function PartyGroupPayments(props) { return <GroupPayments key={`${props.companyId}:${props.orderId}`} {...props} /> }
