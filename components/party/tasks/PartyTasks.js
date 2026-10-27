'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { PARTY_TASK_STATUSES, partyTaskDateInput } from '@helpers/partyTasks'
import {
  getPartyTaskDueLabel,
  getPartyTaskQuickDate,
  matchesPartyTaskFilter,
} from '@helpers/partyTaskPresentation'
import FieldHelp from '@components/FieldHelp'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const RichEditor = dynamic(
  () => import('@components/party/reports/PartyReportRichEditor'),
  { ssr: false }
)
const control =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const emptyDraft = (staffId = '', orderId = null) => ({
  title: '',
  descriptionHtml: '',
  dueAt: '',
  assigneeStaffIds: staffId && /^[a-f\d]{24}$/i.test(staffId) ? [staffId] : [],
  assigneeRoleId: '',
  orderId,
  recurrence: { frequency: 'none', interval: 1, until: null },
})

export default function PartyTasks({
  companyId,
  orderId = null,
  compact = false,
  onChanged,
  onDirtyChange,
}) {
  const [data, setData] = useState({ tasks: [], staff: [], roles: [] })
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [draft, setDraft] = useState(null)
  const draftKey = useRef('')
  const draftBaseline = useRef('')
  const dirty = Boolean(
    draft && JSON.stringify(draft) !== draftBaseline.current
  )
  const formId = useId()
  const generation = useRef(0)
  useEffect(() => {
    onDirtyChange?.(dirty || uploading)
    return () => onDirtyChange?.(false)
  }, [dirty, uploading, onDirtyChange])
  const load = useCallback(
    async (cursor = '') => {
      const requestGeneration = ++generation.current
      setBusy(true)
      setError('')
      try {
        const query = new URLSearchParams()
        if (orderId) query.set('orderId', orderId)
        if (cursor) query.set('cursor', cursor)
        const result = await apiJson(`/api/party/tasks?${query}`, {
          headers: { 'x-partycrm-company-id': companyId },
        })
        if (requestGeneration !== generation.current) return
        setData((previous) => ({
          ...result.data,
          tasks: cursor
            ? [...previous.tasks, ...result.data.tasks]
            : result.data.tasks,
        }))
      } catch (cause) {
        if (requestGeneration === generation.current) setError(cause.message)
      } finally {
        if (requestGeneration === generation.current) setBusy(false)
      }
    },
    [companyId, orderId]
  )
  useEffect(() => {
    setData({ tasks: [], staff: [], roles: [] })
    setDraft(null)
    setEditing(null)
    setNotice(null)
    setSearch('')
    load()
    return () => {
      generation.current += 1
    }
  }, [load])
  usePartyUnsavedChanges(dirty, {
    label: 'задача',
    scope: companyId,
    pending: uploading || (busy && Boolean(draft)),
  })
  const mutate = async (task, patch) => {
    setBusy(true)
    setError('')
    try {
      if (patch.action === 'stop_series') {
        const preview = await apiJson(`/api/party/tasks/${task._id}`, {
          method: 'PATCH',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify({
            revision: task.revision,
            action: 'preview_series_change',
            seriesAction: 'stop_series',
          }),
        })
        if (
          !window.confirm(
            `Остановить серию и отменить ${preview.data.affectedCount} открытых задач? Выполненные задачи и история сохранятся.`
          )
        )
          return
        patch = {
          ...patch,
          confirmSeriesChange: true,
          previewToken: preview.data.previewToken,
        }
      }
      const result = await apiJson(`/api/party/tasks/${task._id}`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ revision: task.revision, ...patch }),
      })
      setData((previous) => ({
        ...previous,
        tasks: previous.tasks.map((row) =>
          row._id === task._id ? result.data : row
        ),
      }))
      setNotice(
        patch.action === 'stop_series'
          ? { text: 'Повторы остановлены.' }
          : patch.status === 'done'
            ? {
                text: 'Задача выполнена.',
                filter: 'done',
                link: 'Показать выполненные',
              }
            : patch.status === 'canceled'
              ? {
                  text: 'Задача отменена.',
                  filter: 'canceled',
                  link: 'Показать отменённые',
                }
              : { text: 'Задача взята в работу.' }
      )
      onChanged?.()
    } catch (cause) {
      if (/измен|Обновите/i.test(cause.message)) await load()
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const begin = (task = null) => {
    draftKey.current = globalThis.crypto.randomUUID()
    setEditing(task)
    const value = task
      ? {
          ...task,
          applyToSeries: false,
          dueAt: partyTaskDateInput(task.dueAt),
          assigneeStaffIds: task.assigneeStaffIds.map(String),
          assigneeRoleId: task.assigneeRoleId
            ? String(task.assigneeRoleId)
            : '',
        }
      : emptyDraft(data.currentStaffId, orderId)
    draftBaseline.current = JSON.stringify(value)
    setDraft(value)
    setError('')
    setNotice(null)
    setStaffSearch('')
  }
  const save = async (event) => {
    event.preventDefault()
    if (uploading) return
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...draft,
        draftKey: draftKey.current,
        dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        recurrence: {
          ...draft.recurrence,
          until: draft.recurrence.until
            ? new Date(draft.recurrence.until).toISOString()
            : null,
        },
      }
      if (editing && draft.applyToSeries) {
        const preview = await apiJson(`/api/party/tasks/${editing._id}`, {
          method: 'PATCH',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify({
            ...payload,
            revision: editing.revision,
            action: 'preview_series_change',
            seriesAction: 'edit',
            applyToSeries: true,
          }),
        })
        if (
          !window.confirm(
            `Изменить эту и будущие задачи серии? Будет обновлено ${preview.data.affectedCount} открытых задач. Выполненные задачи и история сохранятся.`
          )
        )
          return
        payload.confirmSeriesChange = true
        payload.previewToken = preview.data.previewToken
      }
      const result = await apiJson(
        editing ? `/api/party/tasks/${editing._id}` : '/api/party/tasks',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify(
            editing
              ? { ...payload, action: 'edit', revision: editing.revision }
              : payload
          ),
        }
      )
      if (!editing || !matchesPartyTaskFilter(result.data, filter))
        setFilter(
          ['done', 'canceled'].includes(result.data.status)
            ? result.data.status
            : 'open'
        )
      setSearch('')
      setNotice({
        text: editing ? 'Изменения задачи сохранены.' : 'Задача создана.',
      })
      setDraft(null)
      setEditing(null)
      onChanged?.()
      await load()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const applyQuickDate = (days) =>
    setDraft((previous) => ({
      ...previous,
      dueAt: partyTaskDateInput(getPartyTaskQuickDate(days)),
    }))
  const now = new Date()
  const query = search.trim().toLocaleLowerCase('ru-RU')
  const tasks = data.tasks
    .filter(
      (task) =>
        matchesPartyTaskFilter(task, filter, now) &&
        (!query ||
          [task.title, task.orderTitle]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('ru-RU')
            .includes(query))
    )
    .sort(
      (a, b) =>
        (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) -
        (b.dueAt ? new Date(b.dueAt).getTime() : Infinity)
    )
  const quickFilters = [
    ['open', 'Открытые'],
    ['overdue', 'Просрочено'],
    ['today', 'Сегодня'],
    ['undated', 'Без срока'],
  ]
  const statusStyles = {
    new: 'bg-sky-50 text-sky-800',
    in_progress: 'bg-amber-50 text-amber-900',
    done: 'bg-emerald-50 text-emerald-800',
    canceled: 'bg-slate-100 text-slate-600',
  }
  const staffById = new Map(
    data.staff.map((person) => [String(person._id), person.name])
  )
  const rolesById = new Map(
    data.roles.map((role) => [String(role._id), role.title])
  )
  return (
    <section className="min-w-0 space-y-4" aria-label="Задачи">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!compact && (
          <div>
            <h1 className="text-xl font-bold text-sky-950">Задачи</h1>
            <p className="mt-1 text-sm text-slate-500">
              Просроченные и ближайшие поручения.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Статус задач"
            className={`${control} w-auto cursor-pointer`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="open">Открытые</option>
            <option value="overdue">Просрочено</option>
            <option value="today">Сегодня</option>
            <option value="undated">Без срока</option>
            <option value="all">Все</option>
            {Object.entries(PARTY_TASK_STATUSES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {data.canCreate && !draft && (
            <button
              type="button"
              className={`${button} bg-sky-600 text-white`}
              disabled={busy}
              onClick={() => begin()}
            >
              + Задача
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={busy || Boolean(draft)}
            onClick={() => load()}
          >
            Обновить
          </button>
        </div>
      </div>
      {error && !draft && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <span>{notice.text}</span>
          {notice.filter && (
            <button
              type="button"
              className="min-h-10 cursor-pointer font-semibold underline underline-offset-4"
              onClick={() => {
                setFilter(notice.filter)
                setSearch('')
              }}
            >
              {notice.link}
            </button>
          )}
        </div>
      )}
      {!draft && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Найти задачу</span>
              <input
                type="search"
                className={control}
                placeholder="Найти по названию или заказу"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {search && (
              <button
                type="button"
                className={button}
                aria-label="Очистить поиск задач"
                onClick={() => setSearch('')}
              >
                Сбросить
              </button>
            )}
          </div>
          <div
            role="group"
            className="flex flex-wrap gap-2"
            aria-label="Быстрые фильтры задач"
          >
            {quickFilters.map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm transition ${filter === value ? 'border-sky-700 bg-sky-700 text-white' : value === 'overdue' && data.tasks.some((task) => matchesPartyTaskFilter(task, value, now)) ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                onClick={() => setFilter(value)}
              >
                {label}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${filter === value ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}
                >
                  {
                    data.tasks.filter((task) =>
                      matchesPartyTaskFilter(task, value, now)
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          {data.nextCursor && (
            <p className="text-xs text-slate-500">
              Фильтры и поиск учитывают загруженные задачи. Остальные доступны
              по кнопке «Показать ещё».
            </p>
          )}
        </div>
      )}
      {draft && (
        <form
          className="space-y-3 rounded-xl border border-sky-200 bg-white p-3 sm:p-4"
          onSubmit={save}
        >
          <h2 className="font-semibold">
            {editing ? 'Изменить задачу' : 'Новая задача'}
          </h2>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <label className="block text-sm">
              Название
              <input
                autoFocus
                required
                maxLength={240}
                className={`${control} mt-1`}
                value={draft.title}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <details
              open={Boolean(editing?.descriptionHtml)}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3"
            >
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-sky-800">
                {draft.descriptionHtml
                  ? 'Описание и фотографии'
                  : 'Добавить описание или фото'}
              </summary>
              <div className="pb-3">
                <RichEditor
                  key={editing?._id || draftKey.current}
                  value={draft.descriptionHtml}
                  onChange={(descriptionHtml) =>
                    setDraft((previous) => ({ ...previous, descriptionHtml }))
                  }
                  companyId={companyId}
                  uploadUrl="/api/party/task-media"
                  uploadFields={
                    editing
                      ? { taskId: editing._id }
                      : { draftKey: draftKey.current }
                  }
                  label="Описание задачи"
                  disabled={busy}
                  onUploadingChange={setUploading}
                />
              </div>
            </details>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Срок
                <input
                  type="datetime-local"
                  className={`${control} mt-1`}
                  value={draft.dueAt}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      dueAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label htmlFor={`${formId}-role`} className="block text-sm">
                Должность
                <FieldHelp
                  label="Назначение должности"
                  text="Задачу видят все уполномоченные сотрудники этой должности. Достаточно выполнения одним; система запомнит, кто выполнил."
                />
                <select
                  id={`${formId}-role`}
                  className={`${control} mt-1 cursor-pointer`}
                  value={draft.assigneeRoleId}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      assigneeRoleId: event.target.value,
                    }))
                  }
                >
                  <option value="">Без должности</option>
                  {data.roles.map((role) => (
                    <option key={role._id} value={role._id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Быстрый срок">
              {[
                [0, 'Сегодня'],
                [1, 'Завтра'],
                [2, 'Через 2 дня'],
                [7, 'Через неделю'],
              ].map(([days, label]) => (
                <button
                  type="button"
                  key={days}
                  className={button}
                  onClick={() => applyQuickDate(days)}
                >
                  {label}
                </button>
              ))}
            </div>
            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium">
                Сотрудники · выбрано {draft.assigneeStaffIds.length}
              </legend>
              {data.staff.length > 6 && (
                <label className="mb-2 block">
                  <span className="sr-only">Найти сотрудника</span>
                  <input
                    type="search"
                    placeholder="Найти сотрудника"
                    className={control}
                    value={staffSearch}
                    onChange={(event) => setStaffSearch(event.target.value)}
                  />
                </label>
              )}
              <div className="mt-1 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
                {data.staff
                  .filter(
                    (person) =>
                      !staffSearch.trim() ||
                      person.name
                        .toLocaleLowerCase('ru-RU')
                        .includes(staffSearch.trim().toLocaleLowerCase('ru-RU'))
                  )
                  .map((person) => (
                    <label
                      key={person._id}
                      className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-sky-50"
                    >
                      <input
                        type="checkbox"
                        className="cursor-pointer"
                        checked={draft.assigneeStaffIds.includes(person._id)}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            assigneeStaffIds: event.target.checked
                              ? [...previous.assigneeStaffIds, person._id]
                              : previous.assigneeStaffIds.filter(
                                  (id) => id !== person._id
                                ),
                          }))
                        }
                      />
                      {person.name}
                    </label>
                  ))}
                {draft.assigneeStaffIds
                  .filter((id) => !staffById.has(String(id)))
                  .map((id) => (
                    <label
                      key={id}
                      className="flex min-h-10 cursor-pointer items-center gap-2 rounded bg-amber-50 px-2 text-sm text-amber-900"
                    >
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          setDraft((previous) => ({
                            ...previous,
                            assigneeStaffIds: previous.assigneeStaffIds.filter(
                              (value) => value !== id
                            ),
                          }))
                        }
                      />
                      Недоступный сотрудник — снять назначение
                    </label>
                  ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Можно выбрать сотрудников, должность или оба варианта. Выполнить
                задачу достаточно одному.
              </p>
            </fieldset>
            {editing?.seriesRootId && editing.seriesActive && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.applyToSeries === true}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      applyToSeries: event.target.checked,
                      recurrence: event.target.checked
                        ? editing.seriesRecurrence || editing.recurrence
                        : editing.recurrence,
                    }))
                  }
                />
                Изменить эту и будущие задачи серии
              </label>
            )}
            {(!editing || draft.applyToSeries) && (
              <details
                open={draft.recurrence.frequency !== 'none'}
                className="rounded-lg border border-slate-200 px-3"
              >
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-sky-800">
                  Повторение
                  {draft.recurrence.frequency === 'none'
                    ? ' · не повторяется'
                    : ''}
                </summary>
                <div className="grid gap-3 pb-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    Повторение
                    <select
                      className={`${control} mt-1 cursor-pointer`}
                      value={draft.recurrence.frequency}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          recurrence: {
                            ...previous.recurrence,
                            frequency: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="none">Не повторять</option>
                      <option value="daily">Каждый день</option>
                      <option value="weekly">Каждую неделю</option>
                      <option value="monthly">Каждый месяц</option>
                    </select>
                  </label>
                  {draft.recurrence.frequency !== 'none' && (
                    <>
                      <label className="block text-sm">
                        Каждый N-й период
                        <input
                          type="number"
                          min={1}
                          max={365}
                          required
                          className={`${control} mt-1`}
                          value={draft.recurrence.interval}
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              recurrence: {
                                ...previous.recurrence,
                                interval: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="block text-sm">
                        Повторять до
                        <input
                          type="date"
                          className={`${control} mt-1`}
                          value={
                            draft.recurrence.until
                              ? String(draft.recurrence.until).slice(0, 10)
                              : ''
                          }
                          onChange={(event) =>
                            setDraft((previous) => ({
                              ...previous,
                              recurrence: {
                                ...previous.recurrence,
                                until: event.target.value || null,
                              },
                            }))
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              </details>
            )}
          </fieldset>
          <div className="sticky bottom-[calc(var(--party-mobile-nav-height,0px)+env(safe-area-inset-bottom))] z-10 -mx-3 -mb-3 flex flex-wrap gap-2 rounded-b-xl border-t border-slate-100 bg-white p-3 sm:-mx-4 sm:-mb-4 sm:p-4 md:bottom-0">
            {error && (
              <p
                role="alert"
                className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className={`${button} flex-1 bg-sky-600 text-white sm:flex-none`}
              disabled={busy || uploading}
            >
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || uploading}
              onClick={() => {
                if (!dirty || window.confirm('Закрыть редактор без сохранения?')) {
                  setDraft(null)
                  setEditing(null)
                }
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {busy && !data.tasks.length && (
        <p role="status" className="p-3 text-sm text-slate-500">
          Загрузка задач…
        </p>
      )}
      {!busy && !error && !tasks.length && (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-5 text-sm text-slate-600">
          <p>
            {search
              ? 'Ничего не найдено. Попробуйте другое название или заказ.'
              : filter === 'overdue'
                ? 'Просроченных задач нет.'
                : filter === 'today'
                  ? 'На сегодня задач нет.'
                  : 'Задач с выбранным статусом пока нет.'}
          </p>
          {(search || filter !== 'open') && (
            <button
              type="button"
              className="mt-3 min-h-10 cursor-pointer font-semibold text-sky-800 underline underline-offset-4"
              onClick={() => {
                setFilter('open')
                setSearch('')
              }}
            >
              Показать открытые задачи
            </button>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        Показано задач: {tasks.length}
      </p>
      <div className="space-y-3">
        {tasks.map((task) => (
          <article
            key={task._id}
            className={`min-w-0 rounded-xl border bg-white p-3 sm:p-4 ${matchesPartyTaskFilter(task, 'overdue', now) ? 'border-red-200' : 'border-sky-100'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 font-semibold break-words text-slate-900">
                {task.title}
              </h2>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[task.status] || statusStyles.new}`}
              >
                {PARTY_TASK_STATUSES[task.status]}
              </span>
            </div>
            <p
              className={`mt-1 text-sm ${matchesPartyTaskFilter(task, 'overdue', now) ? 'font-semibold text-red-700' : 'text-slate-500'}`}
            >
              {getPartyTaskDueLabel(task, now)}
            </p>
            {task.orderTitle && (
              <p className="mt-1 text-xs break-words text-slate-500">
                Заказ: {task.orderTitle}
              </p>
            )}
            {(task.assigneeRoleId || task.assigneeStaffIds?.length > 0) && (
              <p className="mt-1 text-xs break-words text-slate-500">
                Кому:{' '}
                {[
                  task.assigneeRoleId
                    ? rolesById.get(String(task.assigneeRoleId)) || 'Должность'
                    : '',
                  ...(task.assigneeStaffIds || [])
                    .slice(0, 2)
                    .map((id) => staffById.get(String(id)) || 'Сотрудник'),
                  (task.assigneeStaffIds || []).length > 2
                    ? `ещё ${task.assigneeStaffIds.length - 2}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {task.descriptionHtml && (
              <details className="mt-2 rounded-lg bg-slate-50 px-3">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-sky-800">
                  Описание и вложения
                </summary>
                <div
                  className="max-w-none pb-3 text-sm break-words [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
                  dangerouslySetInnerHTML={{ __html: task.descriptionHtml }}
                />
              </details>
            )}
            {(task.blockedReason ||
              task.deadlineWarning ||
              task.calendarWarning ||
              task.orphaned) && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
                {task.blockedReason ||
                  task.deadlineWarning ||
                  task.calendarWarning ||
                  'Один из назначенных сотрудников неактивен. Требуется решение администратора.'}
              </p>
            )}
            {task.status === 'done' && (
              <p className="mt-2 text-xs text-slate-500">
                Выполнил:{' '}
                {task.completedByName ||
                  data.staff.find(
                    (person) => person._id === String(task.completedByStaffId)
                  )?.name ||
                  'Сотрудник'}
                {task.completedAt
                  ? ` · ${new Date(task.completedAt).toLocaleString('ru-RU')}`
                  : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {task.canComplete &&
                ['new', 'in_progress'].includes(task.status) && (
                  <>
                    {task.status === 'new' && (
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          mutate(task, {
                            action: 'status',
                            status: 'in_progress',
                          })
                        }
                      >
                        В работу
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${button} bg-sky-600 text-white`}
                      disabled={busy}
                      onClick={() =>
                        mutate(task, { action: 'status', status: 'done' })
                      }
                    >
                      Выполнено
                    </button>
                  </>
                )}
              {(task.canEdit || task.canCancel) && (
                <details
                  className="relative ml-auto"
                  name={`${formId}-task-actions`}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      event.currentTarget.open = false
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.currentTarget.open = false
                      event.currentTarget.querySelector('summary')?.focus()
                    }
                  }}
                >
                  <summary
                    className={`${button} list-none text-center [&::-webkit-details-marker]:hidden`}
                  >
                    Ещё
                    <span className="sr-only">
                      : действия с задачей {task.title}
                    </span>
                  </summary>
                  <div className="absolute top-full right-0 z-20 mt-1 min-w-52 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    {task.canEdit && (
                      <button
                        type="button"
                        className={`${button} w-full border-transparent text-left`}
                        disabled={busy || Boolean(draft)}
                        onClick={(event) => {
                          event.currentTarget.closest('details').open = false
                          begin(task)
                        }}
                      >
                        Изменить
                      </button>
                    )}
                    {task.canCancel &&
                      ['new', 'in_progress'].includes(task.status) && (
                        <button
                          type="button"
                          className={`${button} w-full border-transparent text-left text-red-700`}
                          disabled={busy}
                          onClick={(event) => {
                            event.currentTarget.closest('details').open = false
                            if (window.confirm('Отменить задачу?'))
                              mutate(task, {
                                action: 'status',
                                status: 'canceled',
                              })
                          }}
                        >
                          Отменить
                        </button>
                      )}
                    {task.canEdit && task.seriesActive && (
                      <button
                        type="button"
                        className={`${button} w-full border-transparent text-left text-red-700`}
                        disabled={busy}
                        onClick={(event) => {
                          event.currentTarget.closest('details').open = false
                          mutate(task, { action: 'stop_series' })
                        }}
                      >
                        Остановить повторы
                      </button>
                    )}
                  </div>
                </details>
              )}
            </div>
          </article>
        ))}
      </div>
      {data.nextCursor && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => load(data.nextCursor)}
        >
          Показать ещё
        </button>
      )}
    </section>
  )
}
