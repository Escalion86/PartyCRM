'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const toLocalInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

const statusLabels = {
  waiting: 'Ожидаем ответ',
  message_received: 'Ответ получен',
  call_completed: 'Дозвонились',
  not_required: 'Сверка не требуется',
}

export default function PartyOrderPreparationPanel({
  companyId,
  orderId,
  staffId = '',
  staff = [],
  manager = false,
}) {
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const endpoint = manager
    ? `/api/party/orders/${orderId}/preparation`
    : `/api/party/performer/orders/${orderId}/preparation?staffId=${staffId}`
  const headers = useMemo(
    () => (manager ? { 'x-partycrm-company-id': companyId } : undefined),
    [companyId, manager]
  )

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const response = await apiJson(endpoint, { headers, cache: 'no-store' })
      setData(response.data)
      setDraft(response.data.preparation)
      setDirty(false)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [endpoint, headers])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!dirty) return
    const protect = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])

  const staffById = useMemo(
    () =>
      new Map(
        staff.map((person) => [
          String(person._id),
          [person.firstName, person.secondName].filter(Boolean).join(' ') ||
            'Сотрудник',
        ])
      ),
    [staff]
  )
  const change = (producer) => {
    setDraft((current) => producer(current))
    setDirty(true)
    setError('')
  }

  const saveManager = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await apiJson(endpoint, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          expectedRevision: draft.revision,
          preparation: {
            enabled: draft.enabled,
            items: draft.items.map((item) => ({
              _id: item._id || undefined,
              title: item.title,
              status: item.status,
              responsibleStaffId: item.responsibleStaffId || null,
              dueAt: item.dueAt || null,
              note: item.note || '',
            })),
            clientCheck: {
              status: draft.clientCheck.status,
              note: draft.clientCheck.note || '',
            },
            assembly: {
              status: draft.assembly.status,
              plannedAt: draft.assembly.plannedAt || null,
              note: draft.assembly.note || '',
            },
            addressChange: {
              before: draft.addressChange.before || '',
              after: draft.addressChange.after || '',
            },
          },
        }),
      })
      setData(response.data)
      setDraft(response.data.preparation)
      setDirty(false)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const performerAction = async (body) => {
    setBusy(true)
    setError('')
    try {
      const response = await apiJson(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setData(response.data)
      setDraft(response.data.preparation)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (busy && !draft)
    return <p className="text-sm text-slate-500">Загрузка подготовки…</p>
  if (!draft)
    return (
      <p role="alert" className="text-sm text-red-700">
        {error || 'Подготовка недоступна.'}{' '}
        <button
          type="button"
          className="cursor-pointer underline"
          onClick={load}
        >
          Повторить
        </button>
      </p>
    )

  const readiness = draft.readiness || {}
  const permissions = data?.permissions || {}
  const acknowledged = new Set(
    (draft.addressChange.acknowledgements || []).map((item) => item.staffId)
  )

  return (
    <div className="space-y-4">
      {manager && (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              change((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          Контролировать готовность этого заказа
        </label>
      )}
      {draft.enabled ? (
        <>
          <div
            className={`rounded-lg p-3 text-sm ${readiness.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}
          >
            {readiness.ok
              ? 'Подготовка завершена.'
              : (readiness.blockers || [])
                  .map((item) => item.message)
                  .join(' · ')}
          </div>

          <section className="space-y-2">
            <h4 className="font-semibold">Чеклист</h4>
            {draft.items.map((item, index) => {
              const canToggle =
                manager || permissions.itemIds?.includes(String(item._id))
              return (
                <div
                  key={item._id || index}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  {manager ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm sm:col-span-2">
                        Пункт
                        <input
                          className={control}
                          value={item.title}
                          maxLength={240}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              items: current.items.map((value, itemIndex) =>
                                itemIndex === index
                                  ? { ...value, title: event.target.value }
                                  : value
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Ответственный
                        <select
                          className={control}
                          value={item.responsibleStaffId || ''}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              items: current.items.map((value, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...value,
                                      responsibleStaffId: event.target.value,
                                    }
                                  : value
                              ),
                            }))
                          }
                        >
                          <option value="">Не назначен</option>
                          {staff.map((person) => (
                            <option key={person._id} value={person._id}>
                              {staffById.get(String(person._id))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Срок
                        <input
                          type="datetime-local"
                          className={control}
                          value={toLocalInput(item.dueAt)}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              items: current.items.map((value, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...value,
                                      dueAt: fromLocalInput(event.target.value),
                                    }
                                  : value
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        Комментарий
                        <textarea
                          className={control}
                          maxLength={1000}
                          value={item.note || ''}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              items: current.items.map((value, itemIndex) =>
                                itemIndex === index
                                  ? { ...value, note: event.target.value }
                                  : value
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="text-sm">
                      <strong>{item.title}</strong>
                      {item.dueAt && (
                        <p className="text-slate-500">
                          До {new Date(item.dueAt).toLocaleString('ru-RU')}
                        </p>
                      )}
                      {item.note && (
                        <p className="whitespace-pre-wrap text-slate-600">
                          {item.note}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={button}
                      disabled={busy || !canToggle}
                      onClick={() =>
                        manager
                          ? change((current) => ({
                              ...current,
                              items: current.items.map((value, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...value,
                                      status:
                                        value.status === 'done'
                                          ? 'pending'
                                          : 'done',
                                    }
                                  : value
                              ),
                            }))
                          : performerAction({
                              action: 'set_item_status',
                              itemId: item._id,
                              status:
                                item.status === 'done' ? 'pending' : 'done',
                            })
                      }
                    >
                      {item.status === 'done'
                        ? 'Вернуть в работу'
                        : 'Отметить выполненным'}
                    </button>
                    {manager && (
                      <button
                        type="button"
                        className={button}
                        onClick={() =>
                          change((current) => ({
                            ...current,
                            items: current.items.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {manager && (
              <button
                type="button"
                className={button}
                onClick={() =>
                  change((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        title: '',
                        status: 'pending',
                        responsibleStaffId: '',
                        dueAt: null,
                        note: '',
                      },
                    ],
                  }))
                }
              >
                Добавить пункт
              </button>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Сверка с клиентом
              <select
                className={control}
                disabled={!manager}
                value={draft.clientCheck.status}
                onChange={(event) =>
                  change((current) => ({
                    ...current,
                    clientCheck: {
                      ...current.clientCheck,
                      status: event.target.value,
                    },
                  }))
                }
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Сборка
              <select
                className={control}
                disabled={!manager}
                value={draft.assembly.status}
                onChange={(event) =>
                  change((current) => ({
                    ...current,
                    assembly: {
                      ...current.assembly,
                      status: event.target.value,
                    },
                  }))
                }
              >
                <option value="not_started">Не начата</option>
                <option value="planned">Запланирована</option>
                <option value="in_progress">Собирается</option>
                <option value="ready">Готова</option>
              </select>
            </label>
            {manager && (
              <>
                <label className="text-sm sm:col-span-2">
                  Плановая дата сборки
                  <input
                    type="datetime-local"
                    className={control}
                    value={toLocalInput(draft.assembly.plannedAt)}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        assembly: {
                          ...current.assembly,
                          plannedAt: fromLocalInput(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Результат сверки
                  <textarea
                    className={control}
                    maxLength={1000}
                    value={draft.clientCheck.note || ''}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        clientCheck: {
                          ...current.clientCheck,
                          note: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Комментарий к сборке
                  <textarea
                    className={control}
                    maxLength={1000}
                    value={draft.assembly.note || ''}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        assembly: {
                          ...current.assembly,
                          note: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </>
            )}
          </section>

          {(manager || draft.addressChange.before) && (
            <section className="space-y-2">
              <h4 className="font-semibold">Изменение адреса</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  Было
                  <textarea
                    className={control}
                    disabled={!manager}
                    value={draft.addressChange.before}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        addressChange: {
                          ...current.addressChange,
                          before: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Стало
                  <textarea
                    className={control}
                    disabled={!manager}
                    value={draft.addressChange.after}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        addressChange: {
                          ...current.addressChange,
                          after: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              {manager && draft.addressChange.before && (
                <div className="text-sm text-slate-600">
                  {staff
                    .filter((person) =>
                      (draft.addressChange.acknowledgements || []).some(
                        (item) => String(item.staffId) === String(person._id)
                      )
                    )
                    .map((person) => staffById.get(String(person._id)))
                    .join(', ') || 'Пока никто не подтвердил ознакомление.'}
                </div>
              )}
              {!manager &&
                permissions.canAcknowledgeAddress &&
                !acknowledged.has(String(staffId)) && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      performerAction({ action: 'acknowledge_address' })
                    }
                  >
                    Я ознакомился с новым адресом
                  </button>
                )}
            </section>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Контроль подготовки для заказа выключен.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {manager && dirty && (
        <button
          type="button"
          className={`${button} bg-sky-50`}
          disabled={busy}
          onClick={saveManager}
        >
          {busy ? 'Сохранение…' : 'Сохранить подготовку'}
        </button>
      )}
    </div>
  )
}
