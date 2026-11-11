'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faPaste } from '@fortawesome/free-solid-svg-icons/faPaste'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'
import { formatPhoneNumber, normalizePhoneNumber } from '@helpers/phoneInput'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import PartyRoleNewClient from './PartyRoleNewClient'

const focusStyle = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700'
const buttonStyle = `min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50 ${focusStyle}`
const nameOf = (client) => client?.name || 'Клиент без имени'
const phoneOf = (client) => formatPhoneNumber(client?.phone) || String(client?.phone || '')

function ClientPickerDialog({
  companyId, context, clients, selectedId, onChoose, onClose,
  initialForm, onFormStateChange, onDirtyChange,
}) {
  const [search, setSearch] = useState('')
  const [lookup, setLookup] = useState(null)
  const [retry, setRetry] = useState(0)
  const [creating, setCreating] = useState(() => initialForm?.open ? initialForm : null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [clipboardMessage, setClipboardMessage] = useState('')
  const searchRef = useRef(null)
  const createRef = useRef(null)
  const cancelledForm = useRef(null)
  const query = search.trim()
  const canReadName = canPartyAccess(context, { resource: 'orders.client.name' })
  const canReadPhone = canPartyAccess(context, { resource: 'orders.client.phone' })
  const canReadEmail = canPartyAccess(context, { resource: 'orders.client.email' })
  const canSearch = canReadName || canReadPhone || canReadEmail
  const canCreate = canPartyAccess(context, { resource: 'orders', action: 'create' }) &&
    canPartyAccess(context, { resource: 'clients.create', action: 'edit' })
  const searchHint = [canReadName && 'имя', canReadPhone && 'телефон', !canReadName && !canReadPhone && canReadEmail && 'email'].filter(Boolean).join(' или ')

  useEffect(() => {
    if (!query || creating || !canSearch) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query })
        const result = await apiJson(`/api/party/order-options/clients?${params}`, {
          headers: { 'x-partycrm-company-id': companyId },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!controller.signal.aborted) setLookup({ query, retry, clients: result.data })
      } catch (error) {
        if (!controller.signal.aborted) setLookup({ query, retry, error: error.message })
      }
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [canSearch, companyId, creating, query, retry])

  useEffect(() => {
    if (!creating) return
    const frame = requestAnimationFrame(() => createRef.current?.querySelector('input:not(:disabled), button:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [creating])

  const results = query ? lookup?.clients || [] : clients.slice(0, 40)
  const loading = Boolean(query && (lookup?.query !== query || lookup.retry !== retry))
  const handleDirtyChange = useCallback((value) => {
    setDirty(value)
    onDirtyChange(value)
  }, [onDirtyChange])
  const select = (client) => {
    onChoose(client)
    onClose()
  }
  const pasteSearch = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setSearch(text.trim().slice(0, 120))
      setClipboardMessage('')
    } catch {
      setClipboardMessage('Вставьте номер вручную в поле поиска.')
    }
    searchRef.current?.focus()
  }
  const startCreating = () => {
    if (cancelledForm.current?.query === query) {
      setCreating(cancelledForm.current.form)
      return
    }
    const phone = canPartyAccess(context, { resource: 'orders.client.phone', action: 'edit' }) ? normalizePhoneNumber(query) : null
    setCreating({
      open: true,
      draft: { firstName: '', secondName: '', thirdName: '', phone: phone ? Number(phone) : null, email: '' },
    })
  }
  const cancelCreating = (keepDraft) => {
    cancelledForm.current = keepDraft && initialForm?.open ? { query, form: initialForm } : null
    setCreating(null)
    onFormStateChange(null)
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  return (
    <Modal
      open
      title={creating ? 'Новый клиент' : 'Выбор клиента'}
      tone="party"
      size="lg"
      initialFocusRef={searchRef}
      disableBackdropClick={busy}
      hasUnsavedChanges={Boolean(creating && dirty && !busy)}
      onClose={() => {
        if (busy) return
        if (creating) cancelCreating(false)
        else onClose()
      }}
    >
      {creating ? (
        <div ref={createRef}>
          <PartyRoleNewClient
            context={context}
            companyId={companyId}
            initialState={creating}
            onStateChange={onFormStateChange}
            onDirtyChange={handleDirtyChange}
            onBusyChange={setBusy}
            onCancel={() => cancelCreating(true)}
            onCreated={select}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {canSearch && <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-medium">
              Поиск клиента
              <input
                ref={searchRef}
                type="search"
                inputMode={canReadPhone && !canReadName && !canReadEmail ? 'tel' : undefined}
                value={search}
                maxLength={120}
                placeholder={searchHint}
                className={`mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base ${focusStyle}`}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setClipboardMessage('')
                }}
              />
            </label>
            {canReadPhone && <button type="button" className={buttonStyle} aria-label="Вставить номер из буфера" onClick={pasteSearch}>
              <FontAwesomeIcon icon={faPaste} aria-hidden="true" />
            </button>}
          </div>}
          {clipboardMessage && <p className="text-sm text-slate-600" role="status">{clipboardMessage}</p>}
          {canCreate && <button type="button" className={`${buttonStyle} border-sky-700 bg-sky-700 text-white hover:bg-sky-800`} onClick={startCreating}>Создать клиента</button>}
          {loading ? <p className="text-sm text-slate-600" role="status">Ищем клиентов…</p> : query && lookup?.error ? (
            <div className="space-y-2 text-sm">
              <p role="alert" className="text-red-800">{lookup.error}</p>
              <button type="button" className={buttonStyle} onClick={() => setRetry((value) => value + 1)}>Повторить поиск</button>
            </div>
          ) : results.length ? (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200" aria-label="Клиенты">
              {results.map((client) => {
                const phone = phoneOf(client)
                return (
                  <li key={client._id}>
                    <button type="button" className={`flex min-h-11 w-full cursor-pointer flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left hover:bg-sky-50 ${focusStyle}`} onClick={() => select(client)}>
                      <span className="min-w-0 break-words text-sm font-semibold">{nameOf(client)}</span>
                    {(phone || client.email) && <span className="min-w-0 break-all text-sm text-slate-600 tabular-nums">{phone || client.email}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-slate-600" role="status">{query ? 'Клиенты не найдены. Измените запрос.' : 'Клиентов пока нет.'}</p>}
          {selectedId && <button type="button" className={buttonStyle} onClick={() => select(null)}>Убрать клиента</button>}
        </div>
      )}
    </Modal>
  )
}

export default function PartyOrderClientPicker({
  companyId, context, clients, selectedId, savedName, canEdit, disabled, open,
  onOpen, onClose, onChoose, initialForm, onFormStateChange, onDirtyChange, fieldError,
}) {
  const triggerRef = useRef(null)
  const selected = clients.find((client) => String(client._id) === selectedId)
  const selectedName = selected ? nameOf(selected) : selectedId ? savedName || 'Сохранённый клиент' : ''
  const contact = phoneOf(selected) || selected?.email || ''
  const valueLabel = [selectedName || 'выбрать клиента', contact].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0 sm:max-w-sm">
      <p className="mb-1 text-sm font-medium">Основной клиент</p>
      {canEdit ? (
        <button
          type="button"
          ref={triggerRef}
          aria-label={`Основной клиент: ${valueLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          {...fieldError}
          disabled={disabled}
          className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:bg-sky-50 aria-invalid:border-red-700 disabled:cursor-not-allowed disabled:opacity-60 ${focusStyle}`}
          onClick={onOpen}
        >
          <span className="min-w-0 break-words">
            <span className={selectedName ? 'font-semibold' : 'text-slate-600'}>{selectedName || 'Выбрать клиента'}</span>
            {contact && <span className="block break-all text-slate-600 tabular-nums">{contact}</span>}
          </span>
          <FontAwesomeIcon icon={faChevronDown} className="shrink-0 text-slate-600" aria-hidden="true" />
        </button>
      ) : <p className="break-words text-sm">{selectedName || 'Клиент не выбран'}{contact ? ` · ${contact}` : ''}</p>}
      {open && canEdit && <ClientPickerDialog
        companyId={companyId} context={context} clients={clients} selectedId={selectedId}
        onChoose={onChoose} onClose={() => {
          onClose()
          requestAnimationFrame(() => triggerRef.current?.focus())
        }} initialForm={initialForm}
        onFormStateChange={onFormStateChange} onDirtyChange={onDirtyChange}
      />}
    </div>
  )
}
