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

const roles = { performer: 'Исполнитель', admin: 'Администратор мероприятия', assistant: 'Помощник' }
const confirmations = { pending: 'Ожидает ответа', confirmed: 'Подтверждено', declined: 'Отказ', done: 'Завершено' }
const assignmentPayload = (rows) => rows.map(({ staffId, role }) => ({ staffId, role }))

function OrderTeamEditor({ companyId, orderId, onSaved }) {
  const [order, setOrder] = useState(null)
  const [assigned, setAssigned] = useState([])
  const [candidateId, setCandidateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warnings, setWarnings] = useState([])
  const controller = useRef(null)
  const submitting = useRef(false)
  const request = useCallback((options = {}) => apiJson(`/api/party/orders/${orderId}/team`, {
    ...options, cache: 'no-store', headers: { 'x-partycrm-company-id': companyId },
  }), [companyId, orderId])
  const refresh = useCallback(async () => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setLoading(true)
    setError('')
    setNotice('')
    setWarnings([])
    try {
      const response = await request({ signal: current.signal })
      if (current.signal.aborted) return
      setOrder(response.data)
      setAssigned(response.data.assignedStaff || [])
      setCandidateId('')
      setNeedsRefresh(false)
    } catch (failure) {
      if (!current.signal.aborted) { setNeedsRefresh(true); setError(failure.message) }
    } finally {
      if (!current.signal.aborted) setLoading(false)
    }
  }, [request])
  useEffect(() => {
    refresh()
    return () => controller.current?.abort()
  }, [refresh])
  const editable = order && ['draft', 'active'].includes(order.status)
  const disabled = !editable || loading || saving || needsRefresh
  const candidates = (order?.candidates || []).filter((candidate) => !assigned.some((row) => row.staffId === candidate._id))
  const changed = JSON.stringify(assignmentPayload(assigned)) !== JSON.stringify(assignmentPayload(order?.assignedStaff || []))
  const save = async (event) => {
    event.preventDefault()
    if (disabled || !changed || submitting.current) return
    submitting.current = true
    const current = new AbortController()
    controller.current = current
    setSaving(true)
    setError('')
    setNotice('')
    setWarnings([])
    try {
      const response = await request({ method: 'PATCH', signal: current.signal,
        body: JSON.stringify({ assignedStaff: assignmentPayload(assigned), expectedVersion: order.expectedVersion }),
      })
      if (current.signal.aborted) return
      setOrder(response.data)
      setAssigned(response.data.assignedStaff || [])
      setCandidateId('')
      setNotice('Состав команды сохранён.')
      setWarnings(Array.isArray(response.data.warnings) ? response.data.warnings.filter((warning) => typeof warning === 'string') : [])
      onSaved(response.data)
    } catch (failure) {
      if (current.signal.aborted) return
      setNeedsRefresh(true)
      setError(`${failure.message}. Обновите данные заказа перед повторным сохранением.`)
    } finally {
      submitting.current = false
      if (!current.signal.aborted) setSaving(false)
    }
  }
  return (
    <section className="min-w-0 space-y-3 rounded border bg-white p-4" aria-label="Назначение команды">
      <h2 className="text-lg font-semibold">Назначение команды</h2>
      {loading ? <p role="status">Загрузка заказа…</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-green-700">{notice}</p> : null}
      {warnings.map((warning, index) => <p key={index} role="status" className="text-sm text-amber-800">{warning}</p>)}
      <button type="button" className={buttonClass} disabled={loading || saving} onClick={refresh}>Обновить данные заказа</button>
      {order ? (
        <form onSubmit={save} className="space-y-3">
          <p className="break-words font-medium">{order.title || order.serviceTitle || 'Заказ'}</p>
          <p className="text-sm text-gray-600">{dateText(order.eventDate)}</p>
          {!editable ? <p role="status">Команду закрытого или отменённого заказа нельзя изменить.</p> : null}
          <p className="text-sm text-gray-600">Оплату назначает администратор.</p>
          {!assigned.length ? <p>Исполнители пока не назначены.</p> : null}
          <ul className="space-y-3">
            {assigned.map((row) => (
              <li key={row.staffId} className="min-w-0 space-y-2 rounded border p-3">
                <p className="break-words font-medium">{row.title || 'Сотрудник'}</p>
                <p className="text-sm text-gray-600">{confirmations[row.confirmationStatus] || 'Новое назначение'}</p>
                <label className="block text-sm">Роль в мероприятии: {row.title || 'сотрудник'}
                  <select className="mt-1 w-full cursor-pointer rounded border bg-white p-2" value={row.role} disabled={disabled}
                    onChange={(event) => { setAssigned((previous) => previous.map((item) => item.staffId === row.staffId ? { ...item, role: event.target.value } : item)); setNotice('') }}>
                    {Object.entries(roles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                  </select>
                </label>
                {order.assignedStaff?.some((item) => item.staffId === row.staffId) ? (
                  <p className="text-sm text-gray-600">Снятие назначения — через администратора.</p>
                ) : <button type="button" className={buttonClass} disabled={disabled}
                  aria-label={`Убрать из команды: ${row.title || 'сотрудник'}`}
                  onClick={() => { setAssigned((previous) => previous.filter((item) => item.staffId !== row.staffId)); setNotice('') }}>Убрать из команды</button>}
              </li>
            ))}
          </ul>
          <label className="block text-sm font-medium">Добавить сотрудника
            <select className="mt-1 w-full cursor-pointer rounded border bg-white p-2" value={candidateId} disabled={disabled}
              onChange={(event) => setCandidateId(event.target.value)}>
              <option value="">Выберите сотрудника</option>
              {candidates.map((candidate) => <option key={candidate._id} value={candidate._id}>{candidate.title}</option>)}
            </select>
          </label>
          <button type="button" className={buttonClass} disabled={disabled || !candidateId}
            onClick={() => {
              const candidate = candidates.find((item) => item._id === candidateId)
              if (!candidate) return
              setAssigned((previous) => [...previous, { staffId: candidate._id, title: candidate.title, role: 'performer' }])
              setCandidateId(''); setNotice('')
            }}>Добавить в команду</button>
          <button type="submit" className={`${buttonClass} block bg-blue-600 text-white`} disabled={disabled || !changed}>
            {saving ? 'Сохранение…' : 'Сохранить команду'}
          </button>
        </form>
      ) : null}
    </section>
  )
}

function TeamCompany({ companyId }) {
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
      const response = await apiJson(`/api/party/order-team${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, {
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
      <section className="min-w-0 space-y-3" aria-label="Заказы для назначения команды">
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
              </button>
            </li>
          ))}
        </ul>
        {loading ? <p role="status">Загрузка заказов…</p> : null}
        {!loading && !error && !orders.length ? <p>Нет доступных заказов.</p> : null}
        {cursor ? <button type="button" className={buttonClass} disabled={loading} onClick={() => load(cursor)}>Загрузить ещё</button> : null}
      </section>
      {selectedId ? (
        <OrderTeamEditor key={selectedId} companyId={companyId} orderId={selectedId}
          onSaved={(saved) => setOrders((previous) => previous.map((order) => order._id === saved._id ? saved : order))} />
      ) : <p className="text-sm text-gray-600">Выберите заказ, чтобы назначить исполнителей.</p>}
    </div>
  )
}

export default function PartyOrderTeamWorkspace({ companies = [] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id || '')
  const activeCompanyId = companies.some((company) => company.id === selectedCompanyId)
    ? selectedCompanyId : companies[0]?.id || ''
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-3 sm:p-6">
      <h1 className="text-xl font-semibold">Команда заказов</h1>
      <p className="text-sm text-gray-600">Назначайте исполнителей на открытые заказы компании. Оплату назначает администратор.</p>
      {companies.length > 1 ? (
        <label className="block max-w-md text-sm font-medium">Компания
          <select className="mt-1 w-full cursor-pointer rounded border bg-white p-2" value={activeCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
          </select>
        </label>
      ) : companies[0] ? <p className="text-sm font-medium">{companies[0].title}</p> : null}
      {activeCompanyId ? <TeamCompany key={activeCompanyId} companyId={activeCompanyId} />
        : <p role="status">Нет компаний с доступом к назначению команды.</p>}
    </div>
  )
}
