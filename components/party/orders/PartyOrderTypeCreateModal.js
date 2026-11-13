'use client'

import { useId, useRef, useState } from 'react'
import Modal from '@components/Modal'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'

const button = 'min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

export default function PartyOrderTypeCreateModal({ companyId, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const saving = useRef(false)
  const formId = useId()
  const errorId = useId()
  const dirty = Boolean(title.trim())
  usePartyUnsavedChanges(dirty, { label: 'новый тип заказа', scope: companyId, pending: busy })

  const submit = async (event) => {
    event.preventDefault()
    if (saving.current) return
    if (!dirty) {
      setError('Введите название типа заказа.')
      inputRef.current?.focus()
      return
    }

    saving.current = true
    setBusy(true)
    setError('')
    try {
      const { data } = await apiJson('/api/party/order-types', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ title: title.trim() }),
      })
      await onCreated(data)
    } catch (cause) {
      setError(cause.message || 'Не удалось добавить тип заказа.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Новый тип заказа"
      tone="party"
      size="sm"
      initialFocusRef={inputRef}
      disableBackdropClick={busy}
      hasUnsavedChanges={dirty && !busy}
      onClose={() => { if (!saving.current) onClose() }}
      footer={({ requestClose }) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={`${button} border border-sky-200 text-sky-900 hover:bg-sky-50`} disabled={busy} onClick={requestClose}>Отмена</button>
          <button type="submit" form={formId} className={`${button} bg-sky-700 text-white hover:bg-sky-800`} disabled={busy}>{busy ? 'Добавляем…' : 'Добавить тип'}</button>
        </div>
      )}
    >
      <form id={formId} onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-900">
          Название типа
          <input
            ref={inputRef}
            value={title}
            required
            maxLength={180}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700"
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
            }}
          />
        </label>
        {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      </form>
    </Modal>
  )
}
