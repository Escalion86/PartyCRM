'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'
const money = value => `${Number(value || 0).toLocaleString('ru-RU')} ₽`
const cents = value => {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(value).trim())
  if (!match) return null
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  return Number.isSafeInteger(result) && result >= 100 && result <= 100000000000000 ? result : null
}

export default function PartyGroupPaymentCorrection({ companyId, orderId, payment, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [baseline, setBaseline] = useState(null)
  const [amounts, setAmounts] = useState({})
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const storageKey = `party-payment-correction:${companyId}:${orderId}:${payment._id}`
  const endpoint = `/api/party/orders/${orderId}/group-payments/${payment._id}`
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setPending(JSON.parse(saved))
      setReady(true)
    } catch { setError('Не удалось восстановить исправление. Проверьте доступность хранилища браузера.') }
  }, [storageKey])
  const source = editing && baseline ? baseline : payment
  const parts = source.allocations.map(part => ({ ...part, nextCents: cents(amounts[part.orderId] ?? '') }))
  const sum = parts.reduce((total, part) => total + (part.nextCents || 0), 0)
  const valid = parts.every(part => part.nextCents !== null) && sum === cents(source.amount) && reason.trim() && parts.some(part => part.nextCents !== cents(part.amount))
  const start = () => {
    setBaseline(payment)
    setAmounts(Object.fromEntries(payment.allocations.map(part => [part.orderId, String(part.amount)])))
    setReason(''); setError(''); setMessage(''); setEditing(true)
  }
  const refresh = async () => {
    setBusy(true); setError('')
    try { await onChanged?.(); setEditing(false) }
    catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (inFlight.current || (!pending && !valid)) return
    inFlight.current = true
    setBusy(true); setError(''); setMessage('')
    let confirmed = false
    try {
      const body = pending || { idempotencyKey: crypto.randomUUID(), expectedPaymentRevision: source.revision || 1,
        reason: reason.trim(), allocations: parts.map(part => ({ orderId: part.orderId, amount: part.nextCents / 100 })) }
      if (!pending) {
        sessionStorage.setItem(storageKey, JSON.stringify(body))
        setPending(body)
      }
      const result = await apiJson(endpoint, { method: 'PATCH', headers: { 'x-partycrm-company-id': companyId }, body: JSON.stringify(body) })
      confirmed = true
      setMessage(`Распределение исправлено. Общая сумма не изменилась.${result.data.replayed ? ' Повтор не создал второй правки.' : ''} ${(result.data.warnings || []).join(' ')}`)
      sessionStorage.removeItem(storageKey)
      setPending(null); setEditing(false)
      await onChanged?.()
    } catch (cause) {
      if (!confirmed && cause.status >= 400 && cause.status < 500) {
        sessionStorage.removeItem(storageKey)
        setPending(null)
      }
      setError(confirmed ? `Исправление сохранено, но экран не обновлён: ${cause.message}` : cause.message)
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <div className="space-y-3 pt-2">
    {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {pending ? <div className="space-y-2 rounded-lg bg-amber-50 p-3">
      <p>Результат исправления нужно подтвердить. Повтор отправит исходные данные с защитой от дубликатов.</p>
      <button type="button" className={button} disabled={busy || !ready} onClick={save}>Повторить исправление</button>
    </div> : !editing && <button type="button" className={button} disabled={busy || !ready} onClick={start}>Исправить распределение</button>}
    {editing && !pending && <fieldset className="min-w-0 space-y-3 rounded-lg bg-slate-50 p-3" disabled={busy}>
      <legend className="mb-2 font-medium">Исправление долей платежа</legend>
      <p>Общая сумма: {money(payment.amount)}. Состав заказов сохраняется. Все части должны оставаться открытыми.</p>
      {parts.map(part => <label key={part.orderId} className="block break-words">{part.orderTitle || 'Заказ'} — новая доля, ₽
        <input className={control} inputMode="decimal" value={amounts[part.orderId] ?? ''} onChange={event => setAmounts(current => ({ ...current, [part.orderId]: event.target.value }))} />
        <span className="text-xs text-slate-600">Было: {money(part.amount)} → станет: {part.nextCents === null ? 'Укажите сумму от 1 ₽' : money(part.nextCents / 100)}</span>
      </label>)}
      <p>Распределено: {money(sum / 100)}. Осталось: {money(payment.amount - sum / 100)}.</p>
      <label className="block">Причина исправления<textarea className={control} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !valid} onClick={save}>Сохранить исправление</button><button type="button" className={button} onClick={() => setEditing(false)}>Отмена</button></div>
    </fieldset>}
    {error && !pending && <button type="button" className={button} disabled={busy} onClick={refresh}>Обновить платёж</button>}
    {payment.history?.length > 0 && <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer font-medium">История исправлений ({payment.history.length})</summary>
      <div className="mt-2 space-y-3">{payment.history.map(entry => <div key={entry.revision} className="space-y-1 border-t border-slate-200 pt-2">
        <p>Версия {entry.revision} · {new Date(entry.createdAt).toLocaleString('ru-RU')}</p>
        <p className="break-words text-xs text-slate-600">Автор: {entry.actorName || 'Не указан'}</p>
        <p className="whitespace-pre-wrap break-words">Причина: {entry.reason}</p>
        {entry.before.map(part => <p key={part.orderId} className="break-words">{part.orderTitle || 'Заказ'}: {money(part.amount)} → {money(entry.after.find(next => next.orderId === part.orderId)?.amount)}</p>)}
      </div>)}</div>
    </details>}
  </div>
}
