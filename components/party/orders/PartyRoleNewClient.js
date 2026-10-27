'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import PhoneInput from '@components/PhoneInput'

export default function PartyRoleNewClient({
  context,
  companyId,
  onCreated,
  onDirtyChange,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({
    firstName: '',
    secondName: '',
    thirdName: '',
    phone: null,
    email: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  usePartyUnsavedChanges(open && Object.values(draft).some(Boolean), {
    label: 'новый клиент',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange?.(open && Object.values(draft).some(Boolean))
    return () => onDirtyChange?.(false)
  }, [open, draft, onDirtyChange])
  const can = (resource) =>
    canPartyAccess(context, { resource, action: 'edit' })
  const button =
    'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
  if (!can('clients.create') || !can('orders.clientId')) return null
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(
        Object.entries(draft).filter(
          ([key, value]) =>
            value !== '' &&
            value !== null &&
            can(
              ['firstName', 'secondName', 'thirdName'].includes(key)
                ? 'orders.client.name'
                : `orders.client.${key}`
            )
        )
      )
      const result = await apiJson('/api/party/order-options/clients', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify(body),
      })
      onCreated(result.data)
      setOpen(false)
      setDraft({
        firstName: '',
        secondName: '',
        thirdName: '',
        phone: null,
        email: '',
      })
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
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
      {can('orders.client.name') && (
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['firstName', 'Имя'],
            ['secondName', 'Фамилия'],
            ['thirdName', 'Отчество'],
          ].map(([field, label]) => (
            <label className="text-sm" key={field}>
              {label}
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
                maxLength={120}
                value={draft[field]}
                disabled={busy}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
      )}
      {can('orders.client.phone') && (
        <PhoneInput
          value={draft.phone}
          onChange={(phone) => setDraft((previous) => ({ ...previous, phone }))}
          disabled={busy}
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
            disabled={busy}
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
          disabled={busy}
          onClick={submit}
        >
          {busy ? 'Сохранение…' : 'Создать и выбрать'}
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
