'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { PARTY_ORDER_TRANSACTION_CATEGORY_LABELS, PARTY_ORDER_PAYMENT_METHOD_LABELS } from '@helpers/partyOrderTransactions'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const money = value => `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`

function LegacyLedger({ companyId, orderId, onChanged }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const endpoint = `/api/party/orders/${orderId}/legacy-ledger`
  const headers = { 'x-partycrm-company-id': companyId }
  const inspect = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setOpen(true); setBusy(true); setError(''); setPreview(null)
    try {
      const response = await apiJson(endpoint, { headers, cache: 'no-store' })
      if (active.current) setPreview(response.data)
    } catch (cause) { if (active.current) setError(cause.message) }
    finally { inFlight.current = false; if (active.current) setBusy(false) }
  }
  const migrate = async () => {
    if (inFlight.current || preview?.status !== 'ready') return
    inFlight.current = true
    setBusy(true); setError(''); setMessage('')
    let saved = false
    try {
      const result = await apiJson(endpoint, { method: 'POST', headers, body: JSON.stringify({ expectedFingerprint: preview.fingerprint }) })
      saved = true
      if (!active.current) return
      setMessage(`Журнал перенесён. Прежние суммы сохранены.${result.data.replayed ? ' Повторный запрос не создал копий.' : ''} ${(result.data.warnings || []).join(' ')}`)
      // Success is recorded before refreshing; a refresh failure must not invite a new migration.
      setPreview(current => ({ ...current, status: 'migrated' }))
      await onChanged?.()
      const next = await apiJson(endpoint, { headers, cache: 'no-store' })
      if (active.current) setPreview(next.data)
    } catch (cause) {
      if (active.current) setError(saved ? `Перенос завершён, но экран не обновлён: ${cause.message}` : cause.message)
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }
  return <section className="space-y-3" aria-label="Перенос старого журнала">
    <button type="button" className={button} disabled={busy} onClick={inspect}>{open ? 'Обновить проверку старого журнала' : 'Проверить старый журнал платежей'}</button>
    {open && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <p>Перенос сохраняет суммы и реквизиты старых операций в отдельном журнале. Нового дохода или расхода не возникает. Исходные записи сохраняются в архиве переноса.</p>
      {busy && <p role="status">Проверяем и сохраняем…</p>}
      {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{message}</p>}
      {preview?.status === 'empty' && <p>Старых операций для переноса нет.</p>}
      {preview?.status === 'migrated' && <p>Старый журнал уже перенесён. Ниже — снимок на момент переноса; текущие операции смотрите в журнале заказа.</p>}
      {preview?.issues?.length > 0 && <div className="space-y-1 text-amber-900"><p className="font-medium">Автоматический перенос недоступен:</p><ul className="list-disc space-y-1 pl-5">{preview.issues.map((issue, index) => <li key={index} className="break-words">{issue}</li>)}</ul></div>}
      {preview?.entries?.length > 0 && <>
        {preview.status === 'blocked' && <p className="text-xs text-amber-900">Показаны только корректно распознанные строки. При ошибках итоговые суммы могут быть неполными; перенос не выполняется.</p>}
        <div className="grid grid-cols-2 gap-3"><p>Поступления: <strong>{money(preview.totals?.incomeTotal)}</strong></p><p>Расходы: <strong>{money(preview.totals?.expenseTotal)}</strong></p></div>
        <ol className="space-y-2">{preview.entries.map((entry, index) => <li key={entry._id || index} className="space-y-1 break-words rounded-lg border border-slate-200 bg-white p-3">
          <p className="font-medium">{index + 1}. {entry.type === 'expense' ? 'Расход' : 'Поступление'} · {money(entry.amount)}</p>
          <p>{PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[entry.category] || entry.category} · {entry.date ? new Date(entry.date).toLocaleString('ru-RU') : 'Дата не указана'} · {PARTY_ORDER_PAYMENT_METHOD_LABELS[entry.paymentMethod] || entry.paymentMethod}</p>
          {entry.staffId && <p>Сотрудник: {entry.staffName || entry.staffId}</p>}
          {entry.comment && <p className="whitespace-pre-wrap">{entry.comment}</p>}
        </li>)}</ol>
      </>}
      {preview?.status === 'ready' && <button type="button" className={button} disabled={busy} onClick={migrate}>Перенести {preview.entries.length} операций</button>}
      <p className="text-xs text-slate-500">При ошибке связи обновите проверку или повторите перенос: сервер не создаст второй набор операций. Если данные изменились после проверки, сначала обновите её.</p>
    </div>}
  </section>
}

export default function PartyLegacyLedger(props) { return <LegacyLedger key={`${props.companyId}:${props.orderId}`} {...props} /> }
