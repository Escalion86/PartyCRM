'use client'

import { useEffect, useId, useState } from 'react'
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

// PhoneInput emits numeric values with the country prefix, including partial input.
const toPhoneInput = (phone) => typeof phone === 'number' && phone ? `+${phone}` : phone

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
  onFindExisting,
}) {
  const [open, setOpen] = useState(initialState?.open === true)
  const [draft, setDraft] = useState(() => initialState?.draft || emptyDraft)
  const [fullName, setFullName] = useState(() =>
    typeof initialState?.fullName === 'string'
      ? initialState.fullName
      : formatPartyClientFullName(initialState?.draft)
  )
  const [prefilledPhone] = useState(() => Boolean(
    normalizePhoneNumber(toPhoneInput(initialState?.draft?.phone))
  ))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const nameInputId = useId()
  const optionalNameId = `${nameInputId}-optional`
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
  const canEditEmail = can('orders.client.email')
  const optionalName = canEditPhone || canEditEmail
  const multipleFields = [canEditName, canEditPhone, canEditEmail].filter(Boolean).length > 1
  const phoneFirst = canEditPhone && prefilledPhone
  const phoneInput = toPhoneInput(draft.phone)
  const submit = async () => {
    const nameParts = canEditName ? resolvePartyClientNameParts(fullName, draft) : {}
    const nameError = getPartyClientNameError(nameParts)
    if (nameError) {
      setError({ message: nameError })
      return
    }
    const phone = canEditPhone && phoneInput ? normalizePhoneNumber(phoneInput) : null
    if (canEditPhone && phoneInput && !phone) {
      setError({ message: 'Введите полный номер телефона или очистите поле.' })
      return
    }
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    try {
      const body = {
        ...nameParts,
        ...(phone ? { phone: Number(phone) } : {}),
        ...(draft.email && canEditEmail ? { email: draft.email } : {}),
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
      const duplicatePhone = onFindExisting && cause.payload?.error?.code === 'partycrm_client_phone_exists' ? phone : null
      setError({
        message: duplicatePhone ? 'Клиент с таким телефоном уже есть в компании.' : cause.message,
        duplicatePhone,
      })
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
  const phoneField = canEditPhone && (
    <PhoneInput
      value={phoneInput}
      onChange={(phone) => {
        setDraft((previous) => ({ ...previous, phone }))
        setError(null)
      }}
      disabled={busy || disabled}
      tone="party"
      className="w-full"
    />
  )
  return (
    <div
      className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
      role="group"
      aria-label="Новый клиент"
    >
      {multipleFields && <p className="text-sm text-slate-600">Достаточно заполнить одно поле.</p>}
      {phoneFirst && phoneField}
      {canEditName && (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <label htmlFor={nameInputId}>ФИО</label>
            {optionalName && (
              <span id={optionalNameId} className="text-xs text-slate-600">
                Необязательно
              </span>
            )}
          </div>
          <input
            id={nameInputId}
            aria-describedby={optionalName ? optionalNameId : undefined}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base"
            placeholder={PARTY_CLIENT_NAME_PLACEHOLDER}
            value={fullName}
            disabled={busy || disabled}
            onChange={(event) => {
              setFullName(event.target.value)
              setError(null)
            }}
          />
        </div>
      )}
      {!phoneFirst && phoneField}
      {canEditEmail && (
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
        <div className="space-y-1">
          <p role="alert" className="text-sm text-red-800">{error.message}</p>
          {error.duplicatePhone && (
            <button
              type="button"
              className={`${button} hover:bg-white`}
              disabled={busy || disabled}
              onClick={() => onFindExisting(error.duplicatePhone)}
            >
              Найти клиента по телефону
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${button} border-sky-700 bg-sky-700 text-white hover:bg-sky-800`}
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
