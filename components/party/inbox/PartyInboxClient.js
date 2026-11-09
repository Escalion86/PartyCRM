'use client'

import { useCallback, useEffect, useState, useSyncExternalStore, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { PARTY_INBOX_STATUSES, PARTY_INBOX_SALES_STAGES } from '@helpers/partyInboxCore'
import { PARTY_ACTIVE_COMPANY_EVENT, publishPartyActiveCompanyId } from '@helpers/partyActiveCompany'
import { resolvePartyInboxCompanyLink } from '@helpers/partyInboxCompanyLink'
import usePartyUnsavedChanges, { requestPartyLeave } from '@components/party/navigation/usePartyUnsavedChanges'

const PartyOrderWizard = dynamic(() => import('@components/party/orders/PartyOrderWizard'))
const CHANNELS = { vk: 'VK', avito: 'Авито', telegram: 'Telegram', novofon: 'Звонки Novofon' }
const inputClass = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm'
const buttonClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default disabled:opacity-50'
const primaryButtonClass = `${buttonClass} border-sky-700 bg-sky-700 text-white hover:bg-sky-800`
const desktopQuery = '(min-width: 80rem)'
const emptyInbox = { items: [], options: { staff: [], clients: [], orders: [] }, hasMore: false, page: 0 }
const subscribeCompany = (listener) => {
  window.addEventListener('storage', listener)
  window.addEventListener('partycrm-company-change', listener)
  window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, listener)
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('partycrm-company-change', listener); window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, listener) }
}
const readCompany = () => {
  try { return window.localStorage.getItem('partycrm.activeCompanyId') || '' }
  catch { return '' }
}
const readServerCompany = () => ''
const dateLabel = (value) => value ? new Date(value).toLocaleString('ru-RU') : ''
const personLabel = (person) => [person.firstName, person.secondName].filter(Boolean).join(' ') || person.phone || String(person._id)
const localDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const isOverdue = (item, now) => Boolean(item?.responseDueAt && new Date(item.responseDueAt).getTime() < now)
const isContactOverdue = (item, now) => item.status !== 'resolved' && Boolean(item.nextContactAt) && new Date(item.nextContactAt).getTime() < now
const newerItem = (previous, next) => Number(next.revision) >= Number(previous.revision) ? next : previous
const formFields = (item) => ({
  salesStage: item.salesStage || 'new', lostReason: item.lostReason || '', status: item.status,
  nextContactAt: localDate(item.nextContactAt), assigneeStaffId: item.assigneeStaffId || '',
  clientId: item.clientId || '', orderId: item.orderId || '',
})
const durationLabel = (milliseconds) => {
  const minutes = Math.max(0, Math.ceil(Math.abs(milliseconds) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days) return `${days} д ${hours} ч`
  if (hours) return `${hours} ч ${rest} мин`
  return `${rest} мин`
}
const SlaBadge = ({ item, now, className = '' }) => {
  if (!item.responseDueAt) return null
  const dueAt = new Date(item.responseDueAt).getTime()
  if (!Number.isFinite(dueAt)) return null
  const overdue = isOverdue(item, now)
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${overdue ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'} ${className}`}>
    {overdue ? `SLA просрочен на ${durationLabel(now - dueAt)}` : `Ответить за ${durationLabel(dueAt - now)}`}
  </span>
}

async function request(companyId, path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-partycrm-company-id': companyId } })
  const body = await response.json()
  if (!response.ok || !body.success) throw new Error(body.error?.message || (typeof body.error === 'string' ? body.error : 'Не удалось выполнить запрос'))
  return body.data
}

function InboxDetail({ item, companyId, currentStaffId, now, options, onItemUpdated, onBack, headingRef }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState('')
  const [handoffAssignee, setHandoffAssignee] = useState('')
  const [edits, setEdits] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const detailRequest = useRef(null)
  const orderActionRef = useRef(null)
  const endpoint = `/api/party/inbox/${encodeURIComponent(item.id)}`
  const currentFields = formFields(item)
  const draft = { ...currentFields, ...edits?.fields }
  const conflict = Boolean(edits && (edits.revision !== item.revision || edits.incomingToken !== item.incomingToken))
  const handoffActive = Boolean(item.proposedAssigneeStaffId)
  const canAcceptHandoff = handoffActive && String(item.proposedAssigneeStaffId) === String(currentStaffId)
  usePartyUnsavedChanges(Boolean(edits || reply), { label: 'обращение', scope: companyId, pending: busy })

  const refresh = useCallback(async () => {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setRefreshing(true)
    setError('')
    try {
      const next = await request(companyId, endpoint, { signal: controller.signal })
      if (controller.signal.aborted) return
      setDetails(next)
      if (next.item) onItemUpdated(next.item)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message)
    } finally {
      if (!controller.signal.aborted) setRefreshing(false)
    }
  }, [companyId, endpoint, onItemUpdated])
  useEffect(() => {
    refresh()
    return () => detailRequest.current?.abort()
  }, [refresh])

  const change = (field, value) => {
    setNotice('')
    setEdits((previous) => {
      const base = previous || { revision: item.revision, incomingToken: item.incomingToken, original: currentFields }
      const fields = { ...base.fields, [field]: value }
      if (value === base.original[field]) delete fields[field]
      return Object.keys(fields).length ? { ...base, fields } : null
    })
  }
  const keepEdits = () => {
    setEdits((previous) => {
      if (!previous) return null
      const fields = Object.fromEntries(Object.entries(previous.fields).filter(([field, value]) => value !== currentFields[field]))
      return Object.keys(fields).length ? { fields, original: currentFields, revision: item.revision, incomingToken: item.incomingToken } : null
    })
  }
  const save = async (event) => {
    event.preventDefault()
    if (busy || refreshing || conflict) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await request(companyId, endpoint, { method: 'PATCH', body: JSON.stringify({
        salesStage: draft.salesStage, lostReason: draft.lostReason,
        status: draft.status, nextContactAt: draft.nextContactAt ? new Date(draft.nextContactAt).toISOString() : null,
        assigneeStaffId: draft.assigneeStaffId, clientId: draft.clientId, orderId: draft.orderId,
        expectedRevision: Number(edits?.revision ?? item.revision ?? 0),
        expectedIncomingToken: edits?.incomingToken ?? item.incomingToken ?? '',
      }) })
      if (saved.inboxItem) onItemUpdated(saved.inboxItem)
      setEdits(null)
      setNotice('Обращение сохранено')
      if (draft.salesStage !== item.salesStage || draft.lostReason !== item.lostReason) await refresh()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const sendReply = async (event) => {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true); setError('')
    try {
      await request(companyId, `/api/party/integrations/${item.channel}/conversations/${item.sourceId}/messages`, { method: 'POST', body: JSON.stringify({ text: reply.trim() }) })
      setReply('')
      setNotice('Сообщение отправлено')
      await refresh()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const handoffAction = async (action) => {
    if (action === 'propose' && !handoffAssignee) return
    setBusy(true); setError(''); setNotice('')
    try {
      await request(companyId, `${endpoint}/handoff`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          expectedRevision: Number(item.revision || 0),
          ...(action === 'propose' ? { targetStaffId: handoffAssignee } : {}),
        }),
      })
      setHandoffAssignee('')
      await refresh()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  const closeWizard = async (order) => {
    setWizardOpen(false)
    if (order?._id) {
      setNotice('Заказ создан и связан с обращением')
      await refresh()
    }
    window.requestAnimationFrame(() => orderActionRef.current?.focus())
  }
  const orderSelect = <label className="text-sm">
    Связанный заказ
    <select className={`${inputClass} mt-1 cursor-pointer`} value={draft.orderId} required={draft.salesStage === 'won'} onChange={(event) => change('orderId', event.target.value)}>
      {!item.sourceOrderId && <option value="">Не связан</option>}
      {[...new Set([draft.orderId, item.sourceOrderId])].filter((id) => id && !options.orders.some((order) => String(order._id) === id)).map((id) => (
        <option key={id} value={id}>{id === item.sourceOrderId ? 'Заказ из канала' : 'Связанный заказ'}</option>
      ))}
      {options.orders.map((order) => <option key={order._id} value={order._id}>{dateLabel(order.eventDate)} · {order.title || `Заказ ${String(order._id).slice(-6)}`}</option>)}
    </select>
  </label>

  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5" aria-label="Карточка обращения">
    <button type="button" className={`${buttonClass} mb-3 xl:hidden`} onClick={onBack}>К списку обращений</button>
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 ref={headingRef} tabIndex={-1} className="break-words text-lg font-semibold">{item.title}</h2><p className="text-sm text-slate-600">{CHANNELS[item.channel]} · {dateLabel(item.lastActivityAt)}</p><SlaBadge item={item} now={now} className="mt-2" /></div>
      {item.orderId ? <Link ref={orderActionRef} className={buttonClass} href={`/company/work?${new URLSearchParams({ companyId, orderId: item.orderId, mode: 'view' })}`}>Открыть заказ</Link>
        : draft.orderId ? <p className="text-sm text-slate-600">Сохраните связь, чтобы открыть заказ.</p>
          : item.channel === 'novofon' ? <Link ref={orderActionRef} className={buttonClass} href={`/company/calls?${new URLSearchParams({ company: companyId, callId: item.sourceId })}`}>Создать заказ из звонка</Link>
            : <button ref={orderActionRef} type="button" className={buttonClass} disabled={busy} onClick={() => setWizardOpen(true)}>Создать заказ</button>}
    </header>
    {conflict && <div className="mb-3 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
      <p role="status">{edits.incomingToken !== item.incomingToken ? 'Поступило новое сообщение.' : 'Обращение изменилось.'} Проверьте актуальные данные перед сохранением. Ваши правки сохранены в черновике.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || refreshing} onClick={keepEdits}>Продолжить с моими правками</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setEdits(null)}>Сбросить правки</button></div>
    </div>}
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div role="status" className={notice ? 'mb-3 text-sm text-emerald-800' : 'sr-only'}>{notice}</div>
    {handoffActive && <div className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="break-words text-sm">Предложена передача: {personLabel(options.staff.find((person) => String(person._id) === String(item.proposedAssigneeStaffId)) || { _id: item.proposedAssigneeStaffId })}</p>
      <div className="flex flex-wrap gap-2">
        {canAcceptHandoff && <button type="button" className={buttonClass} disabled={busy || refreshing} onClick={() => handoffAction('accept')}>Принять обращение</button>}
        <button type="button" className={buttonClass} disabled={busy || refreshing} onClick={() => handoffAction('cancel')}>Отменить передачу</button>
      </div>
    </div>}
    <form onSubmit={save} className="border-y border-slate-200 py-3">
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm"><span className={isContactOverdue(item, now) ? 'font-semibold text-red-800' : 'font-medium'}>Следующий контакт{isContactOverdue(item, now) ? ' просрочен' : ''}</span><input type="datetime-local" required={draft.status === 'follow_up'} className={`${inputClass} mt-1`} value={draft.nextContactAt} onChange={(event) => change('nextContactAt', event.target.value)} /></label>
        <label className="text-sm">Состояние диалога<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.status} onChange={(event) => change('status', event.target.value)}>{Object.entries(PARTY_INBOX_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {draft.salesStage === 'lost' && <label className="text-sm sm:col-span-2">Причина отказа<textarea required maxLength={1000} className={`${inputClass} mt-1`} value={draft.lostReason} onChange={(event) => change('lostReason', event.target.value)} /></label>}
        {draft.salesStage === 'won' && orderSelect}
        <details className="text-sm sm:col-span-2">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Этап продажи, ответственный и связи</summary>
          <div className="grid gap-3 pb-2 sm:grid-cols-2">
            <label className="text-sm">Этап продажи<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.salesStage} onChange={(event) => change('salesStage', event.target.value)}>{Object.entries(PARTY_INBOX_SALES_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">Ответственный<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.assigneeStaffId} onChange={(event) => change('assigneeStaffId', event.target.value)}><option value="">Не назначен</option>{options.staff.map((person) => <option key={person._id} value={person._id}>{personLabel(person)}</option>)}</select></label>
            <label className="text-sm">Связанный клиент<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.clientId} onChange={(event) => change('clientId', event.target.value)}><option value="">Не связан</option>{draft.clientId && !options.clients.some((client) => String(client._id) === draft.clientId) && <option value={draft.clientId}>Связанный клиент</option>}{options.clients.map((client) => <option key={client._id} value={client._id}>{personLabel(client)}</option>)}</select></label>
            {draft.salesStage !== 'won' && orderSelect}
          </div>
          {options.truncated && <p className="pb-2 text-xs text-slate-600">В выборе показано до 500 клиентов и последних заказов. Ранее сохранённые связи доступны.</p>}
        </details>
      </fieldset>
      <button type="submit" aria-disabled={busy || refreshing || conflict} className={`${primaryButtonClass} aria-disabled:opacity-60`}>Сохранить обращение</button>
    </form>
    {details?.salesHistory?.length > 0 && <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium">История этапов продажи</summary>
      <ol className="mt-2 space-y-2">{details.salesHistory.map((entry, index) => <li key={`${entry.at}:${index}`} className="rounded-lg bg-slate-50 p-2">
        <p>{dateLabel(entry.at)} · {PARTY_INBOX_SALES_STAGES[entry.fromSalesStage] || entry.fromSalesStage} → {PARTY_INBOX_SALES_STAGES[entry.toSalesStage] || entry.toSalesStage}</p>
        {entry.lostReason && <p className="whitespace-pre-wrap break-words text-slate-600">{entry.lostReason}</p>}
      </li>)}</ol>
    </details>}
    <div className="mb-2 mt-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{item.channel === 'novofon' ? 'Звонок' : 'Переписка'}</h3>
      <button type="button" className={buttonClass} disabled={busy || refreshing} onClick={refresh}>{refreshing ? 'Обновляем…' : 'Обновить обращение'}</button>
    </div>
    {!details ? refreshing && <p role="status" className="text-sm text-slate-600">Загрузка истории…</p> : item.channel === 'novofon' ? <div className="space-y-3">
      <p className="whitespace-pre-wrap break-words text-sm">{details.transcript || 'Расшифровка пока недоступна.'}</p>
      {details.recordingUrl && <a className="block cursor-pointer text-sky-700 underline" href={details.recordingUrl} target="_blank" rel="noreferrer">Открыть запись звонка</a>}
    </div> : <>
      {details.truncated && <p className="mb-2 text-xs text-slate-500">Показаны последние 200 сообщений.</p>}
      <div className="max-h-[min(40vh,28rem)] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3" role="region" tabIndex={0} aria-label="История переписки">
        {!details.messages.length && <p className="text-sm text-slate-500">Сообщений пока нет.</p>}
        {details.messages.map((message) => <article key={message.id} className={`max-w-[95%] rounded-lg border p-3 text-sm ${message.direction === 'outgoing' ? 'ml-auto border-sky-100 bg-sky-50' : 'mr-auto border-slate-200 bg-white'}`}>
          <p className="mb-1 text-xs text-slate-500">{message.direction === 'outgoing' ? 'Команда' : 'Клиент'} · {dateLabel(message.sentAt)}{message.status === 'failed' ? ' · Не отправлено' : ''}</p>
          <p className="whitespace-pre-wrap break-words">{message.text || (message.attachments.length ? '' : 'Сообщение без текста')}</p>
          {message.attachments.map((attachment, index) => <a key={`${attachment.url}-${index}`} className="mt-2 block cursor-pointer break-all text-sky-700 underline" href={attachment.url} target="_blank" rel="noreferrer">{attachment.title}</a>)}
        </article>)}
      </div>
      {details.canReply ? <form onSubmit={sendReply} className="mt-3 space-y-2">
        <label className="block text-sm">Ответ в {CHANNELS[item.channel]}<textarea value={reply} disabled={busy} onChange={(event) => setReply(event.target.value)} maxLength={4000} rows={2} className={`${inputClass} mt-1`} placeholder="Введите сообщение" /></label>
        <button type="submit" disabled={busy || !reply.trim()} className={buttonClass}>Отправить сообщение</button>
        <p className="text-xs text-slate-600">Отправка ответа закрывает срок ответа. Состояние диалога задаётся отдельно.</p>
      </form> : <p className="mt-3 text-sm text-amber-700">Окно ответа Telegram истекло. Ответ станет доступен после нового сообщения клиента.</p>}
    </>}
    {!handoffActive && <details className="mt-4 border-t border-slate-200 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">Передать смену</summary>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select aria-label="Новый ответственный" className={`${inputClass} cursor-pointer`} value={handoffAssignee} disabled={busy} onChange={(event) => setHandoffAssignee(event.target.value)}>
          <option value="">Выберите нового ответственного</option>
          {options.staff.filter((person) => String(person._id) !== String(item.assigneeStaffId)).map((person) => <option key={person._id} value={person._id}>{personLabel(person)}</option>)}
        </select>
        <button type="button" className={buttonClass} disabled={busy || refreshing || !handoffAssignee} onClick={() => handoffAction('propose')}>Предложить передачу</button>
      </div>
    </details>}
    {wizardOpen && <PartyOrderWizard companyId={companyId} inboxId={item.id} order={{ clientId: item.clientId }} onClose={() => closeWizard()} onSaved={closeWizard} />}
  </section>
}

function InboxWorkspace({ companyId, currentStaffId }) {
  const [data, setData] = useState(emptyInbox)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [channel, setChannel] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [salesStage, setSalesStage] = useState('')
  const requestSequence = useRef(0)
  const activeRequest = useRef(null)
  const headingRef = useRef(null)
  const searchRef = useRef(null)
  const returnPosition = useRef(null)
  const [now, setNow] = useState(() => Date.now())
  const filters = new URLSearchParams({ scope: overdueOnly ? 'overdue' : 'all' })
  if (salesStage) filters.set('salesStage', salesStage)
  if (channel) filters.set('channel', channel)
  if (status) filters.set('status', status)
  if (searchQuery) filters.set('q', searchQuery)
  const filterKey = filters.toString()
  const filtered = Boolean(salesStage || channel || status || searchQuery || overdueOnly)
  const queue = data.filterKey === filterKey ? data : emptyInbox
  const searching = search.trim() !== searchQuery

  const updateSelected = useCallback((item) => {
    setSelected((previous) => previous?.id === item.id ? newerItem(previous, item) : previous)
    setData((previous) => ({ ...previous, items: previous.items.map((row) => row.id === item.id ? newerItem(row, item) : row) }))
  }, [])

  const load = useCallback(async (page = 0) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const sequence = ++requestSequence.current
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams(filterKey)
      query.set('page', String(page))
      const next = await request(companyId, `/api/party/inbox?${query}`, { signal: controller.signal })
      if (controller.signal.aborted || sequence !== requestSequence.current) return
      setData((previous) => {
        const rows = new Map(previous.items.map((item) => [item.id, item]))
        const items = next.items.map((item) => rows.has(item.id) ? newerItem(rows.get(item.id), item) : item)
        return { ...next, filterKey, options: next.options || previous.options,
          items: page === 0 ? items : [...new Map([...previous.items, ...items].map((item) => [item.id, item])).values()],
        }
      })
      setSelected((previous) => {
        const fresh = previous && next.items.find((item) => item.id === previous.id)
        return fresh ? newerItem(previous, fresh) : previous
      })
    } catch (failure) {
      if (!controller.signal.aborted && sequence === requestSequence.current) setError(failure.message)
    } finally {
      if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false)
    }
  }, [companyId, filterKey])
  useEffect(() => {
    load(0)
    return () => { activeRequest.current?.abort(); requestSequence.current += 1 }
  }, [load])
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const clearFilters = () => {
    setChannel(''); setStatus(''); setSearch(''); setSearchQuery(''); setOverdueOnly(false); setSalesStage('')
    searchRef.current?.focus()
  }
  const openItem = (item, button) => {
    const desktop = window.matchMedia(desktopQuery).matches
    if (item.id === selected?.id && (desktop || mobileDetail)) return
    if (selected && item.id !== selected.id && !requestPartyLeave({ kind: 'record', target: item.id, scope: companyId })) return
    const scroller = button.closest('[data-party-workspace-scroll]') || document.scrollingElement
    returnPosition.current = { button, scroller, scrollTop: scroller?.scrollTop || 0 }
    setSelected(item)
    setMobileDetail(true)
    window.requestAnimationFrame(() => {
      if (!desktop && scroller) scroller.scrollTop = 0
      headingRef.current?.focus({ preventScroll: true })
    })
  }
  const returnToList = () => {
    setMobileDetail(false)
    window.requestAnimationFrame(() => {
      const { button, scroller, scrollTop } = returnPosition.current || {}
      if (button?.isConnected) {
        if (scroller?.isConnected) scroller.scrollTop = scrollTop
        button.focus({ preventScroll: true })
      } else {
        searchRef.current?.focus()
      }
    })
  }
  const visible = queue.items
    .filter((item) => (!status || item.status === status) && (!salesStage || (item.salesStage || 'new') === salesStage) && (!overdueOnly || isOverdue(item, now) || isContactOverdue(item, now)))
    .sort((a, b) => overdueOnly ? new Date(a.overdueAt) - new Date(b.overdueAt) : new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
  return <>
    <div className={mobileDetail ? 'hidden xl:block' : ''}>
    <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <label className="col-span-2 text-sm xl:col-span-1">Поиск<input ref={searchRef} type="search" maxLength={120} className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, сообщение" /></label>
      <label className="text-sm">Канал<select value={channel} onChange={(event) => setChannel(event.target.value)} className={`${inputClass} mt-1 cursor-pointer`}><option value="">Все каналы</option>{Object.entries(CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Состояние<select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} mt-1 cursor-pointer`}><option value="">Все состояния</option>{Object.entries(PARTY_INBOX_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="col-span-2 text-sm xl:col-span-1">Этап продажи<select className={`${inputClass} mt-1 cursor-pointer`} value={salesStage} onChange={(event) => setSalesStage(event.target.value)}><option value="">Все этапы</option>{Object.entries(PARTY_INBOX_SALES_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} className="cursor-pointer" />Все просрочки</label>
      <button type="button" className={buttonClass} disabled={loading || searching} onClick={() => load()}>Обновить список</button>
      {(filtered || searching) && <button type="button" className={buttonClass} onClick={clearFilters}>Сбросить фильтры</button>}
    </div>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
      <section aria-label="Список входящих" className={`min-w-0 space-y-2 ${mobileDetail ? 'hidden xl:block' : ''}`}>
        <p role="status" className="text-sm text-slate-600">{loading || searching ? 'Загрузка обращений…' : ''}</p>
        {!loading && !searching && !error && !visible.length && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{filtered ? 'По этим условиям обращений нет. Сбросьте фильтры или измените запрос.' : 'Обращений пока нет. Входящие из подключённых каналов появятся здесь.'}</p>}
        <div className="space-y-2 xl:max-h-[65vh] xl:overflow-y-auto">
          {visible.map((item) => <button key={item.id} type="button" onClick={(event) => openItem(item, event.currentTarget)} className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700 ${item.id === selected?.id ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-300'}`} aria-pressed={item.id === selected?.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="min-w-0 break-words font-semibold">{item.title}</span><span className="text-xs text-slate-600">{CHANNELS[item.channel]}</span></div>
            <p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{item.preview}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className={item.status === 'needs_reply' ? 'font-semibold text-amber-700' : 'text-slate-600'}>{PARTY_INBOX_STATUSES[item.status]}</span><span className="text-slate-500">{dateLabel(item.lastActivityAt)}</span></div>
            <p className="mt-1 text-xs text-sky-800">{PARTY_INBOX_SALES_STAGES[item.salesStage || 'new']}</p>
            <SlaBadge item={item} now={now} className="mt-2" />
            {item.assigneeStaffId && <p className="mt-1 text-xs text-slate-600">Ответственный: {personLabel(data.options.staff.find((person) => String(person._id) === item.assigneeStaffId) || { _id: item.assigneeStaffId })}</p>}
            {item.nextContactAt && <p className={`mt-1 text-xs ${isContactOverdue(item, now) ? 'font-semibold text-red-800' : 'text-slate-600'}`}>{isContactOverdue(item, now) ? 'Контакт просрочен' : 'Следующий контакт'} · {dateLabel(item.nextContactAt)}</p>}
          </button>)}
        </div>
        {queue.hasMore && <button type="button" disabled={loading || searching} className={`${buttonClass} w-full`} onClick={() => load(queue.page + 1)}>Загрузить ещё обращения</button>}
      </section>
      {selected ? <div className={mobileDetail ? 'min-w-0' : 'hidden min-w-0 xl:block'}>
        <InboxDetail key={selected.id} item={selected} companyId={companyId} currentStaffId={currentStaffId} now={now} options={data.options} onItemUpdated={updateSelected} onBack={returnToList} headingRef={headingRef} />
      </div> : <p className="hidden rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 xl:block">Выберите обращение, чтобы открыть переписку и назначить следующий контакт.</p>}
    </div>
  </>
}

export default function PartyInboxClient({ companies }) {
  const stored = useSyncExternalStore(subscribeCompany, readCompany, readServerCompany)
  const [link, setLink] = useState({ ready: false, requested: null, selected: '' })
  const initializedLink = useRef(false)
  const selectedCompanyRef = useRef('')
  useEffect(() => {
    if (initializedLink.current) return
    const frame = requestAnimationFrame(() => {
    if (initializedLink.current) return
    initializedLink.current = true
    const url = new URL(window.location.href)
    const requested = url.searchParams.get('companyId')
    const resolved = resolvePartyInboxCompanyLink({ companies, requested, stored: readCompany() })
    if (resolved.companyId) publishPartyActiveCompanyId(resolved.companyId, { skipGuard: true })
    if (requested !== null && resolved.companyId) {
      url.searchParams.delete('companyId')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
    setLink({ ready: true, requested: resolved.error ? requested : null, selected: resolved.companyId })
    })
    return () => cancelAnimationFrame(frame)
  }, [companies])
  useEffect(() => {
    const synchronize = (event) => {
      if (event.type === 'storage' && event.key !== 'partycrm.activeCompanyId') return
      const next = String(event.type === 'storage' ? event.newValue || '' : event.detail?.companyId || readCompany())
      if (!companies.some((company) => String(company.id) === next)) {
        const expected = selectedCompanyRef.current
        if (expected && companies.some((company) => String(company.id) === expected))
          queueMicrotask(() => {
            if (selectedCompanyRef.current === expected) publishPartyActiveCompanyId(expected, { skipGuard: true, persist: false })
          })
        setLink((previous) => ({ ...previous, notice: 'Входящие выбранной компании недоступны. Осталась прежняя компания.' }))
        return
      }
      setLink((previous) => !previous.ready || previous.requested !== null || previous.selected === next ? previous : { ...previous, selected: next, notice: '' })
    }
    return subscribeCompany(synchronize)
  }, [companies])
  const requested = link.requested !== null ? link.requested : link.selected && !companies.some((company) => String(company.id) === link.selected) ? link.selected : null
  const resolved = resolvePartyInboxCompanyLink({ companies, requested, stored })
  const companyId = link.ready ? requested !== null ? resolved.companyId : link.selected || resolved.companyId : ''
  useEffect(() => { selectedCompanyRef.current = companyId }, [companyId])
  const currentStaffId = companies.find((company) => company.id === companyId)?.staffId || ''
  return <section aria-labelledby="party-inbox-heading" className="mx-auto w-full max-w-7xl p-4 text-slate-900 sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 id="party-inbox-heading" className="text-2xl font-semibold">Входящие</h1>
      <label className="text-sm">Компания<select aria-label="Активная компания" className={`${inputClass} mt-1 cursor-pointer`} value={companyId} disabled={!link.ready} onChange={(event) => {
        if (!companies.some((company) => String(company.id) === event.target.value) || !publishPartyActiveCompanyId(event.target.value)) return
        const url = new URL(window.location.href)
        url.searchParams.delete('companyId')
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
        setLink({ ready: true, requested: null, selected: event.target.value })
      }}><option value="" disabled>Выберите компанию</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label>
    </div>
    {link.ready && (resolved.error || link.notice) ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{resolved.error || link.notice}</p> : null}
    {companyId ? <InboxWorkspace key={companyId} companyId={companyId} currentStaffId={currentStaffId} /> : <p role="status">Выбор компании…</p>}
  </section>
}
