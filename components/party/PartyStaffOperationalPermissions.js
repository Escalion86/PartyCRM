'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const permissionOptions = [
  {
    key: 'orders.assignments',
    title: 'Назначение исполнителей',
    description: 'Подбор команды открытых заказов компании. Оплату назначает администратор.',
  },
  {
    key: 'inventory.movements',
    title: 'Движение реквизита',
    description: 'Выдача, передача и возврат реквизита.',
  },
  {
    key: 'orders.pricing',
    title: 'Стоимость заказов',
    description:
      'Просмотр и изменение общей стоимости открытых заказов компании. Платежи и выплаты остаются недоступны.',
  },
]

function Permissions({ companyId, staffId, draftRole }) {
  const [snapshot, setSnapshot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const active = useRef(false)
  const pending = useRef(false)
  const endpoint = `/api/party/staff/${staffId}/operational-permissions`

  useEffect(() => {
    let alive = true
    active.current = true
    apiJson(endpoint, {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': companyId },
    })
      .then((result) => {
        if (alive) setSnapshot(result.data)
      })
      .catch((cause) => {
        if (alive) setError(cause.message)
      })
    return () => {
      alive = false
      active.current = false
    }
  }, [companyId, endpoint])

  const refresh = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await apiJson(endpoint, {
        cache: 'no-store',
        headers: { 'x-partycrm-company-id': companyId },
      })
      if (active.current) setSnapshot(result.data)
    } catch (cause) {
      if (active.current) setError(cause.message)
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  const toggle = async (permission) => {
    if (pending.current || !snapshot) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    const granted = snapshot.permissions.includes(permission)
    try {
      const result = await apiJson(endpoint, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({
          permissions: granted
            ? snapshot.permissions.filter((item) => item !== permission)
            : [...snapshot.permissions, permission],
          expectedRevision: snapshot.revision,
        }),
      })
      if (active.current) {
        setSnapshot(result.data)
        setMessage(
          `${permissionOptions.find((item) => item.key === permission).title}: доступ ${granted ? 'отозван' : 'предоставлен'}.`
        )
      }
    } catch (cause) {
      if (active.current) {
        setError(cause.message)
        setSnapshot(null)
      }
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }
  const roleChanged = snapshot && draftRole !== snapshot.role
  return (
    <section
      className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm"
      aria-label="Дополнительные права сотрудника"
    >
      <h3 className="font-semibold">Дополнительные права</h3>
      <p>
        Действия доступны в кабинете исполнителя. Каждое право сохраняется
        сразу, отдельно от карточки сотрудника.
      </p>
      {error && (
        <p role="alert" className="break-words text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700">
          {message}
        </p>
      )}
      {roleChanged ? (
        <p>
          Сначала сохраните новую роль сотрудника и откройте карточку снова.
        </p>
      ) : snapshot?.role === 'performer' ? (
        <>
          {snapshot.status !== 'active' && (
            <p>Право начнёт действовать только после активации сотрудника.</p>
          )}
          {permissionOptions.map((option) => (
            <div
              key={option.key}
              className="space-y-2 rounded border p-3"
              role="group"
              aria-label={option.title}
            >
              <h4 className="font-medium">{option.title}</h4>
              <p>{option.description}</p>
              <p>
                Доступ:{' '}
                <strong>
                  {snapshot.permissions.includes(option.key)
                    ? 'предоставлен'
                    : 'не предоставлен'}
                </strong>
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(option.key)}
                className="min-h-11 cursor-pointer rounded border border-sky-200 px-3 py-2 text-sky-800 disabled:opacity-50"
              >
                {busy
                  ? 'Сохранение…'
                  : snapshot.permissions.includes(option.key)
                    ? 'Отозвать доступ'
                    : 'Предоставить доступ'}
              </button>
            </div>
          ))}
        </>
      ) : (
        snapshot && (
          <p>
            {['owner', 'admin'].includes(snapshot.role)
              ? 'Для владельца и администратора доступ предусмотрен ролью.'
              : 'Дополнительное право доступно только исполнителям.'}
          </p>
        )
      )}
      <button
        type="button"
        disabled={busy}
        onClick={refresh}
        className="min-h-11 cursor-pointer rounded px-3 py-2 text-slate-600 disabled:opacity-50"
      >
        Обновить права
      </button>
    </section>
  )
}

export default function PartyStaffOperationalPermissions(props) {
  if (!props.companyId || !props.staffId) return null
  return <Permissions key={`${props.companyId}:${props.staffId}`} {...props} />
}
