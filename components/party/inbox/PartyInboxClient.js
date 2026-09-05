'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { PARTY_INBOX_STATUSES } from '@helpers/partyInboxCore'

const CHANNELS = { vk: 'VK', avito: 'Авито', telegram: 'Telegram', novofon: 'Звонки Novofon' }
const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const buttonClass = 'cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-50'
const subscribeCompany = (listener) => {
  window.addEventListener('storage', listener)
  window.addEventListener('partycrm-company-change', listener)
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('partycrm-company-change', listener) }
}
const readCompany = () => window.localStorage.getItem('partycrm.activeCompanyId') || ''
const readServerCompany = () => ''
const dateLabel = (value) => value ? new Date(value).toLocaleString('ru-RU') : ''
const personLabel = (person) => [person.firstName, person.secondName].filter(Boolean).join(' ') || person.phone || String(person._id)
const localDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const isOverdue = (item, now) =>
  Boolean(
    item?.status !== 'resolved' &&
      (item?.isOverdue ||
        (item?.responseDueAt && new Date(item.responseDueAt).getTime() <= now))
  )
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
  if (!item.responseDueAt || item.status === 'resolved') return null
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

function InboxDetail({ item, companyId, currentStaffId, now, options, onSaved }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [saved, setSaved] = useState(false)
  const [handoffAssignee, setHandoffAssignee] = useState(item.proposedAssigneeStaffId || '')
  const [draft, setDraft] = useState(() => ({ ...item, nextContactAt: localDate(item.nextContactAt) }))
  const endpoint = `/api/party/inbox/${encodeURIComponent(item.id)}`
  const handoffActive = Boolean(item.proposedAssigneeStaffId)
  const canAcceptHandoff = handoffActive && String(item.proposedAssigneeStaffId) === String(currentStaffId)

  useEffect(() => {
    const controller = new AbortController()
    request(companyId, endpoint, { signal: controller.signal }).then(setDetails).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message)
    })
    return () => controller.abort()
  }, [companyId, endpoint])

  const change = (field, value) => { setSaved(false); setDraft((previous) => ({ ...previous, [field]: value })) }
  const save = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setSaved(false)
    try {
      await request(companyId, endpoint, { method: 'PATCH', body: JSON.stringify({
        status: draft.status, nextContactAt: draft.nextContactAt ? new Date(draft.nextContactAt).toISOString() : null,
        assigneeStaffId: draft.assigneeStaffId, clientId: draft.clientId, orderId: draft.orderId,
        expectedRevision: Number(item.revision || 0),
      }) })
      setSaved(true)
      await onSaved()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const sendReply = async (event) => {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true); setError('')
    try {
      await request(companyId, `/api/party/integrations/${item.channel}/conversations/${item.sourceId}/messages`, { method: 'POST', body: JSON.stringify({ text: reply.trim() }) })
      setReply('')
      setDetails(await request(companyId, endpoint))
      await onSaved()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }
  const handoffAction = async (action) => {
    if (action === 'propose' && !handoffAssignee) return
    setBusy(true); setError(''); setSaved(false)
    try {
      await request(companyId, `${endpoint}/handoff`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          expectedRevision: Number(item.revision || 0),
          ...(action === 'propose' ? { targetStaffId: handoffAssignee } : {}),
        }),
      })
      await onSaved()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Карточка обращения">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg font-semibold">{item.title}</h2><p className="text-sm text-slate-500">{CHANNELS[item.channel]} · {dateLabel(item.lastActivityAt)}</p><SlaBadge item={item} now={now} className="mt-2" /></div>
      <button className={buttonClass} onClick={async () => { try { setDetails(await request(companyId, endpoint)); setError('') } catch (failure) { setError(failure.message) } }}>Обновить переписку</button>
    </div>
    {item.incomingToken !== draft.incomingToken && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">Поступило новое сообщение. Откройте обращение заново после просмотра: текущая правка не закроет новый ответ.</p>}
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold">Передача смены</p>
      {handoffActive && <p className="mt-1 text-sm text-slate-600">Предложено передать обращение: {personLabel(options.staff.find((person) => String(person._id) === String(item.proposedAssigneeStaffId)) || { _id: item.proposedAssigneeStaffId })}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select aria-label="Новый ответственный" className={`${inputClass} cursor-pointer`} value={handoffAssignee} disabled={busy || handoffActive} onChange={(event) => setHandoffAssignee(event.target.value)}>
          <option value="">Выберите нового ответственного</option>
          {options.staff.filter((person) => String(person._id) !== String(item.assigneeStaffId)).map((person) => <option key={person._id} value={person._id}>{personLabel(person)}</option>)}
        </select>
        <button type="button" className={buttonClass} disabled={busy || handoffActive || !handoffAssignee} onClick={() => handoffAction('propose')}>Предложить передачу</button>
      </div>
      {handoffActive && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {canAcceptHandoff && <button type="button" className={`${buttonClass} border-emerald-300 bg-emerald-50 text-emerald-800`} disabled={busy} onClick={() => handoffAction('accept')}>Принять обращение</button>}
        <button type="button" className={buttonClass} disabled={busy} onClick={() => handoffAction('cancel')}>Отменить передачу</button>
      </div>}
    </div>
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Состояние<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.status} onChange={(event) => change('status', event.target.value)}>{Object.entries(PARTY_INBOX_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Ответственный<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.assigneeStaffId} onChange={(event) => change('assigneeStaffId', event.target.value)}><option value="">Не назначен</option>{options.staff.map((person) => <option key={person._id} value={person._id}>{personLabel(person)}</option>)}</select></label>
      <label className="text-sm">Следующий контакт<input type="datetime-local" required={draft.status === 'follow_up'} className={`${inputClass} mt-1`} value={draft.nextContactAt} onChange={(event) => change('nextContactAt', event.target.value)} /></label>
      <label className="text-sm">Клиент<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.clientId} onChange={(event) => change('clientId', event.target.value)}><option value="">Не связан</option>{draft.clientId && !options.clients.some((client) => String(client._id) === draft.clientId) && <option value={draft.clientId}>Связанный клиент · {draft.clientId}</option>}{options.clients.map((client) => <option key={client._id} value={client._id}>{personLabel(client)}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">Заказ<select className={`${inputClass} mt-1 cursor-pointer`} value={draft.orderId} onChange={(event) => change('orderId', event.target.value)}><option value="">Не связан</option>{draft.orderId && !options.orders.some((order) => String(order._id) === draft.orderId) && <option value={draft.orderId}>Связанный заказ · {draft.orderId}</option>}{options.orders.map((order) => <option key={order._id} value={order._id}>{dateLabel(order.eventDate)} · {order.title || `Заказ ${String(order._id).slice(-6)}`}</option>)}</select></label>
      <div className="flex items-center gap-3 sm:col-span-2"><button type="submit" disabled={busy} className={`${buttonClass} bg-sky-600 text-white`}>Сохранить состояние</button>{saved && <span role="status" className="text-sm text-emerald-700">Сохранено</span>}</div>
    </form>
    {options.truncated && <p className="mt-2 text-xs text-slate-500">В выборе показано до 500 клиентов и последних заказов. Ранее сохранённые связи доступны.</p>}
    <div className="my-5 border-t border-slate-200" />
    {!details ? <p role="status" className="text-sm text-slate-500">Загрузка истории…</p> : item.channel === 'novofon' ? <div className="space-y-3">
      <p className="whitespace-pre-wrap break-words text-sm">{details.transcript || 'Расшифровка пока недоступна.'}</p>
      {details.recordingUrl && <a className="block cursor-pointer text-sky-700 underline" href={details.recordingUrl} target="_blank" rel="noreferrer">Открыть запись звонка</a>}
      <Link className="inline-block cursor-pointer text-sky-700 underline" href="/company/calls">Журнал звонков и создание заказа</Link>
    </div> : <>
      {details.truncated && <p className="mb-2 text-xs text-slate-500">Показаны последние 200 сообщений.</p>}
      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3" aria-label="История переписки">
        {!details.messages.length && <p className="text-sm text-slate-500">Сообщений пока нет.</p>}
        {details.messages.map((message) => <article key={message.id} className={`max-w-[95%] rounded-lg border p-3 text-sm ${message.direction === 'outgoing' ? 'ml-auto border-sky-100 bg-sky-50' : 'mr-auto border-slate-200 bg-white'}`}>
          <p className="mb-1 text-xs text-slate-500">{message.direction === 'outgoing' ? 'Команда' : 'Клиент'} · {dateLabel(message.sentAt)}{message.status === 'failed' ? ' · Не отправлено' : ''}</p>
          <p className="whitespace-pre-wrap break-words">{message.text || (message.attachments.length ? '' : 'Сообщение без текста')}</p>
          {message.attachments.map((attachment, index) => <a key={`${attachment.url}-${index}`} className="mt-2 block cursor-pointer break-all text-sky-700 underline" href={attachment.url} target="_blank" rel="noreferrer">{attachment.title}</a>)}
        </article>)}
      </div>
      {details.canReply ? <form onSubmit={sendReply} className="mt-3 space-y-2">
        <label className="block text-sm">Ответ в {CHANNELS[item.channel]}<textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={4000} rows={3} className={`${inputClass} mt-1`} placeholder="Введите сообщение" /></label>
        <button disabled={busy || !reply.trim()} className={`${buttonClass} bg-sky-600 text-white`}>Отправить сообщение</button>
        <p className="text-xs text-slate-500">Успешная отправка ответа закрывает SLA. Состояние диалога задаётся отдельно.</p>
      </form> : <p className="mt-3 text-sm text-amber-700">Окно ответа Telegram истекло. Ответ станет доступен после нового сообщения клиента.</p>}
    </>}
  </section>
}

function InboxWorkspace({ companyId, currentStaffId }) {
  const [data, setData] = useState({ items: [], options: { staff: [], clients: [], orders: [] }, hasMore: false, page: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [channel, setChannel] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (page = 0, signal) => {
    setLoading(true); setError('')
    try {
      const next = await request(companyId, `/api/party/inbox?page=${page}`, { signal })
      setData((previous) => ({ ...next, page: Math.max(previous.page, next.page), hasMore: page < previous.page ? previous.hasMore : next.hasMore, options: next.options || previous.options, items: [...new Map([...previous.items, ...next.items.map((item) => ({ ...item, loadedPage: page }))].map((item) => [item.id, item])).values()] }))
    } catch (failure) { if (!signal?.aborted) setError(failure.message) } finally { if (!signal?.aborted) setLoading(false) }
  }, [companyId])
  useEffect(() => {
    const controller = new AbortController()
    load(0, controller.signal)
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const visible = useMemo(() => data.items.filter((item) => (!channel || item.channel === channel) && (!status || item.status === status) && (!overdueOnly || isOverdue(item, now)) && `${item.title} ${item.preview}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt)), [data.items, channel, status, search, overdueOnly, now])
  const selected = data.items.find((item) => item.id === selectedId)
  return <>
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Канал<select value={channel} onChange={(event) => setChannel(event.target.value)} className={`${inputClass} mt-1 cursor-pointer`}><option value="">Все каналы</option>{Object.entries(CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Состояние<select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} mt-1 cursor-pointer`}><option value="">Все состояния</option>{Object.entries(PARTY_INBOX_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm">Поиск<input className={`${inputClass} mt-1`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон, сообщение" /></label>
      <div className="flex items-end gap-3"><button className={buttonClass} disabled={loading} onClick={() => load()}>Обновить</button><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} className="cursor-pointer" />Просрочен SLA</label></div>
    </div>
    <p className="mb-4 text-xs text-slate-500">История подключённых VK, Авито, Telegram Business и Novofon. Новое входящее возвращает состояние «Нужен ответ». Список обновляется кнопкой. Фильтры применяются к загруженным обращениям.</p>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
      <section aria-label="Список входящих" className="min-w-0 space-y-2">
        {loading && <p role="status" className="text-sm text-slate-500">Загрузка…</p>}
        {!loading && !visible.length && <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Обращений по этим условиям нет. Проверьте подключение каналов в настройках компании.</p>}
        <div className="max-h-[65vh] space-y-2 overflow-y-auto">
          {visible.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setSelectionVersion((value) => value + 1) }} className={`w-full cursor-pointer rounded-xl border p-4 text-left ${item.id === selectedId ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-sky-300'}`} aria-pressed={item.id === selectedId}>
            <div className="flex justify-between gap-2"><span className="break-words font-semibold">{item.title}</span><span className="shrink-0 text-xs text-slate-500">{CHANNELS[item.channel]}</span></div>
            <p className="mt-1 truncate text-sm text-slate-600">{item.preview}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className={item.status === 'needs_reply' ? 'font-semibold text-amber-700' : 'text-slate-600'}>{PARTY_INBOX_STATUSES[item.status]}</span><span className="text-slate-500">{dateLabel(item.lastActivityAt)}</span></div>
            <SlaBadge item={item} now={now} className="mt-2" />
            {item.assigneeStaffId && <p className="mt-1 text-xs text-slate-600">Ответственный: {personLabel(data.options.staff.find((person) => String(person._id) === item.assigneeStaffId) || { _id: item.assigneeStaffId })}</p>}
            {item.nextContactAt && <p className={`mt-1 text-xs ${item.status !== 'resolved' && new Date(item.nextContactAt) < new Date() ? 'text-red-700' : 'text-slate-500'}`}>Контакт: {dateLabel(item.nextContactAt)}</p>}
          </button>)}
        </div>
        {data.hasMore && <button disabled={loading} className={`${buttonClass} w-full`} onClick={() => load(data.page + 1)}>Загрузить более ранние обращения</button>}
      </section>
      {selected ? <InboxDetail key={`${selected.id}:${selectionVersion}:${selected.revision}:${selected.incomingToken}`} item={selected} companyId={companyId} currentStaffId={currentStaffId} now={now} options={data.options} onSaved={() => load(selected.loadedPage || 0)} /> : <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Выберите обращение для ответа и следующего действия.</p>}
    </div>
  </>
}

export default function PartyInboxClient({ companies }) {
  const stored = useSyncExternalStore(subscribeCompany, readCompany, readServerCompany)
  const companyId = companies.find((company) => company.id === stored)?.id || companies[0]?.id || ''
  const currentStaffId = companies.find((company) => company.id === companyId)?.staffId || ''
  return <main className="mx-auto w-full max-w-7xl p-4 text-slate-900 sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Входящие</h1><p className="mt-1 text-sm text-slate-500">Обращения, ответы и следующие контакты</p></div>
      <label className="text-sm">Компания<select aria-label="Активная компания" className={`${inputClass} mt-1 cursor-pointer`} value={companyId} onChange={(event) => { window.localStorage.setItem('partycrm.activeCompanyId', event.target.value); window.dispatchEvent(new Event('partycrm-company-change')) }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label>
    </div>
    {companyId ? <InboxWorkspace key={companyId} companyId={companyId} currentStaffId={currentStaffId} /> : <p role="status">Выбор компании…</p>}
  </main>
}
