'use client'

import { useEffect, useState } from 'react'
import PhoneInput from '@components/PhoneInput'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { normalizePhoneNumber } from '@helpers/phoneInput'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  formatPartyClientFullName,
  getPartyClientNameError,
  PARTY_CLIENT_NAME_PLACEHOLDER,
  resolvePartyClientNameParts,
} from '@helpers/partyClientFullName'

const control =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const phoneKey = (value) =>
  normalizePhoneNumber(value) || String(value ?? '').replace(/\D/g, '')

export default function PartyRoleOrderClientEditor({
  companyId,
  order,
  client,
  context,
  disabled,
  onSaved,
  onDirtyChange,
}) {
  const [open, setOpen] = useState(false)
  const nameParts = client?.nameParts
  const baseline = {
    name: nameParts ? formatPartyClientFullName(nameParts) : order.client?.name || '',
    phone: client?.phone ?? order.client?.phone ?? null,
    email: client?.email ?? order.client?.email ?? '',
  }
  const [draft, setDraft] = useState(() => structuredClone(baseline))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canEdit = (field) =>
    canPartyAccess(context, {
      resource: `orders.client.${field}`,
      action: 'edit',
    })
  const canEditName = canEdit('name') && (!order.clientId || nameParts)
  const patch = {}
  if (canEditName && draft.name.trim() !== baseline.name.trim()) {
    if (nameParts) {
      const changes = Object.entries(resolvePartyClientNameParts(draft.name, nameParts))
        .filter(([key, value]) => value !== (nameParts[key] || ''))
      if (changes.length) patch.name = Object.fromEntries(changes)
    } else {
      patch.name = draft.name.trim()
    }
  }
  if (canEdit('phone') && phoneKey(draft.phone) !== phoneKey(baseline.phone))
    patch.phone = draft.phone
  if (
    canEdit('email') &&
    draft.email.trim().toLowerCase() !== baseline.email.trim().toLowerCase()
  )
    patch.email = draft.email.trim()
  const dirty = open && Object.keys(patch).length > 0
  usePartyUnsavedChanges(dirty, {
    label: 'контакт клиента',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  if (
    !order._id ||
    ['closed', 'canceled'].includes(order.status) ||
    !['name', 'phone', 'email'].some(canEdit)
  )
    return null
  const save = async (event) => {
    event.preventDefault()
    if (busy || disabled || !dirty) return
    const nameError = nameParts && patch.name ? getPartyClientNameError(patch.name) : ''
    if (nameError) {
      setError(nameError)
      return
    }
    if (
      Object.hasOwn(patch, 'phone') &&
      patch.phone != null &&
      (!normalizePhoneNumber(patch.phone) ||
        String(patch.phone).replace(/\D/g, '').length !== 11)
    ) {
      setError('Введите полный номер телефона или очистите поле.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await apiJson(`/api/party/orders/${order._id}/client`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({
          expectedUpdatedAt: new Date(order.updatedAt).toISOString(),
          client: patch,
        }),
      })
      onDirtyChange(false)
      onSaved(result.data, !result.data)
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить контакт')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      {!open ? (
        <button
          type="button"
          className={button}
          disabled={disabled}
          onClick={() => {
            setDraft(structuredClone(baseline))
            setOpen(true)
          }}
        >
          Изменить контакт
        </button>
      ) : (
        <form
          className="space-y-3 rounded-xl border border-sky-100 p-3"
          onSubmit={save}
        >
          <p className="text-sm font-semibold">Контакт заказчика</p>
          {canEdit('name') && order.clientId && !nameParts ? (
            <p className="text-xs text-slate-500">
              Изменить ФИО можно в карточке клиента.
            </p>
          ) : null}
          <fieldset
            disabled={disabled || busy}
            className="grid min-w-0 gap-3 sm:grid-cols-2"
          >
            {canEditName ? (
              <label className="block text-sm sm:col-span-2">
                ФИО
                <input
                  className={control}
                  maxLength={nameParts ? undefined : 240}
                  placeholder={PARTY_CLIENT_NAME_PLACEHOLDER}
                  value={draft.name}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, name: event.target.value }))
                    setError('')
                  }}
                />
              </label>
            ) : null}
            {canEdit('phone') ? (
              <PhoneInput
                className="w-full"
                label="Телефон контакта"
                tone="party"
                value={draft.phone}
                onChange={(phone) =>
                  setDraft((previous) => ({ ...previous, phone }))
                }
              />
            ) : null}
            {canEdit('email') ? (
              <label className="block text-sm">
                Email контакта
                <input
                  aria-label="Email контакта"
                  type="email"
                  maxLength={160}
                  className={control}
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setDraft(structuredClone(baseline))
                setError('')
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              className={button}
              disabled={disabled || busy || !dirty}
            >
              Сохранить контакт
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
