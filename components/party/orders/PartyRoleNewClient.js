'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { normalizePhoneNumber } from '@helpers/phoneInput'
import PhoneInput from '@components/PhoneInput'
import {
  formatPartyClientFullName,
  getPartyClientNameError,
  PARTY_CLIENT_NAME_PLACEHOLDER,
  resolvePartyClientNameParts,
} from '@helpers/partyClientFullName'

const emptyDraft = {
  firstName: '',
  secondName: '',
  thirdName: '',
  phone: null,
  email: '',
}

export default function PartyRoleNewClient({
  context,
  companyId,
  onCreated,
  onDirtyChange,
  disabled = false,
  initialState = null,
  onStateChange,
  onCancel,
  onBusyChange,
}) {
  const [open, setOpen] = useState(initialState?.open === true)
  const [draft, setDraft] = useState(() => initialState?.draft || emptyDraft)
  const [fullName, setFullName] = useState(() =>
    typeof initialState?.fullName === 'string'
      ? initialState.fullName
      : formatPartyClientFullName(initialState?.draft)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = open && Boolean(fullName.trim() || draft.phone || draft.email)
  usePartyUnsavedChanges(dirty, {
    label: 'новый клиент',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    onStateChange?.({ open, draft, fullName })
  }, [open, draft, fullName, onStateChange])
  const can = (resource) =>
    canPartyAccess(context, { resource, action: 'edit' })
  const button =
    'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
  if (!can('clients.create') || !can('orders.clientId')) return null
  const canEditName = can('orders.client.name')
  const canEditPhone = can('orders.client.phone')
  // PhoneInput emits numeric values with the country prefix, including partial input.
  const phoneInput = typeof draft.phone === 'number' && draft.phone ? `+${draft.phone}` : draft.phone
  const submit = async () => {
    const nameParts = canEditName ? resolvePartyClientNameParts(fullName, draft) : {}
    const nameError = getPartyClientNameError(nameParts)
    if (nameError) {
      setError(nameError)
      return
    }
    const phone = canEditPhone && phoneInput ? normalizePhoneNumber(phoneInput) : null
    if (canEditPhone && phoneInput && !phone) {
      setError('Введите полный номер телефона или очистите поле.')
      return
    }
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    try {
      const body = {
        ...nameParts,
        ...(phone ? { phone: Number(phone) } : {}),
        ...(draft.email && can('orders.client.email') ? { email: draft.email } : {}),
      }
      const result = await apiJson('/api/party/order-options/clients', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify(body),
      })
      onCreated(result.data)
      setOpen(false)
      setDraft(emptyDraft)
      setFullName('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }
  if (!open)
    return (
      <button
        type="button"
        className={button + ' border-transparent px-0 hover:underline'}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        + Новый клиент
      </button>
    )
  return (
    <div
      className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
      role="group"
      aria-label="Новый клиент"
    >
      {canEditName && (
        <label className="block text-sm">
          ФИО
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
            placeholder={PARTY_CLIENT_NAME_PLACEHOLDER}
            value={fullName}
            disabled={busy || disabled}
            onChange={(event) => {
              setFullName(event.target.value)
              setError('')
            }}
          />
        </label>
      )}
      {canEditPhone && (
        <PhoneInput
          value={phoneInput}
          onChange={(phone) => {
            setDraft((previous) => ({ ...previous, phone }))
            setError('')
          }}
          disabled={busy || disabled}
          tone="party"
          className="w-full"
        />
      )}
      {can('orders.client.email') && (
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            value={draft.email}
            disabled={busy || disabled}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                email: event.target.value,
              }))
            }
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || disabled}
          onClick={submit}
        >
          {busy ? 'Сохранение…' : 'Создать и выбрать'}
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || disabled}
          onClick={() => {
            setOpen(false)
            onCancel?.()
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
