'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyRoleNewClient from './PartyRoleNewClient'

export default function PartyBriefContactField({
  value,
  onChange,
  companyId,
  orderId,
  disabled,
  options: suppliedOptions,
  fieldId,
  onDirtyChange,
}) {
  const [remote, setRemote] = useState(null)
  const [created, setCreated] = useState([])
  const [error, setError] = useState('')
  const reportDirty = useCallback((dirty) => onDirtyChange?.(fieldId, dirty), [fieldId, onDirtyChange])
  useEffect(() => {
    if (!companyId || suppliedOptions) return
    const controller = new AbortController()
    apiJson(`/api/party/order-options${orderId ? `?orderId=${orderId}` : ''}`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setRemote(result.data)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [companyId, orderId, suppliedOptions])
  const options = suppliedOptions || remote
  const people = [
    ...(options?.clients || []),
    ...created.filter(
      (person) =>
        !(options?.clients || []).some((item) => item._id === person._id)
    ),
  ]
  const choose = (clientId) => {
    const person = people.find((item) => String(item._id) === clientId)
    onChange(
      clientId
        ? {
            clientId,
            name: person?.name || value?.name || 'Контакт',
            ...(person?.phone ? { phone: person.phone } : {}),
            ...(person?.email ? { email: person.email } : {}),
          }
        : null
    )
  }
  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <select
        aria-label="Выберите контакт для вопроса"
        className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        disabled={disabled || !options}
        value={value?.clientId || ''}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">
          {companyId ? 'Выберите контакт' : 'Выбор контакта появится в заказе'}
        </option>
        {value?.clientId &&
        !people.some((person) => String(person._id) === value.clientId) ? (
          <option value={value.clientId}>
            {value.name || 'Выбранный контакт'}
          </option>
        ) : null}
        {people.map((person) => (
          <option key={String(person._id)} value={String(person._id)}>
            {person.name}
            {person.phone ? ` · ${person.phone}` : ''}
          </option>
        ))}
      </select>
      {options?.context && companyId ? (
        <PartyRoleNewClient
          onDirtyChange={reportDirty}
          context={options.context}
          companyId={companyId}
          disabled={disabled}
          onCreated={(person) => {
            setCreated((previous) => [...previous, person])
            onChange({
              clientId: String(person._id),
              name: person.name,
              phone: person.phone,
              email: person.email,
            })
          }}
        />
      ) : null}
    </div>
  )
}
