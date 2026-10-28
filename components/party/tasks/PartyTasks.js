'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { PARTY_TASK_STATUSES, partyTaskDateInput } from '@helpers/partyTasks'
import {
  getPartyTaskQuickDate,
  matchesPartyTaskFilter,
} from '@helpers/partyTaskPresentation'
import {
  buildPartyTasksQuery,
  mergePartyTaskBoardPages,
  mergePartyTaskRows,
  PARTY_TASK_BOARD_STATUSES,
  readPartyTaskView,
  savePartyTaskView,
} from '@helpers/partyTaskViews'
import PartyTaskBoard from './PartyTaskBoard'
import PartyTaskCard from './PartyTaskCard'
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
  const [querySearch, setQuerySearch] = useState('')
  const [scope, setScope] = useState('all')
  const [view, setView] = useState('list')
  const preferenceIdentity = useRef('')
  const controller = useRef(null)
  const queryTime = useRef(new Date())
  const board = !compact && view === 'board' && filter !== 'canceled'
  const requestKey = JSON.stringify([
    companyId,
    orderId,
    filter,
    querySearch,
    scope,
    board,
  ])
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])
  const [staffSearch, setStaffSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState(false)
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
    async (cursor = '', status = '') => {
      const requestGeneration = ++generation.current
      controller.current?.abort()
      const abortController = new AbortController()
      controller.current = abortController
      setBusy(true)
      setError('')
      if (!cursor) {
        queryTime.current = new Date()
        setData((previous) => ({
          ...previous,
          tasks: [],
          columns: {},
          nextCursor: null,
          loadedQueryKey: null,
        }))
      }
      const fetchPage = async (columnStatus = '') => {
        const query = buildPartyTasksQuery({
          orderId,
          filter,
          search: querySearch,
          scope,
          status: columnStatus,
          cursor,
          now: queryTime.current,
        })
        const result = await apiJson(`/api/party/tasks?${query}`, {
          headers: { 'x-partycrm-company-id': companyId },
          signal: abortController.signal,
        })
        return { status: columnStatus, data: result.data }
      }
      try {
        if (board) {
          const pages = await Promise.all(
            (status ? [status] : PARTY_TASK_BOARD_STATUSES).map(fetchPage)
          )
          if (requestGeneration !== generation.current) return
          setData((previous) => ({
            ...mergePartyTaskBoardPages(previous, pages, Boolean(cursor)),
            loadedQueryKey: requestKey,
          }))
        } else {
          const page = await fetchPage()
          if (requestGeneration !== generation.current) return
          setData((previous) => ({
            ...page.data,
            loadedQueryKey: requestKey,
            tasks: cursor
              ? mergePartyTaskRows(previous.tasks, page.data.tasks)
              : page.data.tasks,
            staff: cursor
              ? mergePartyTaskRows(previous.staff, page.data.staff)
              : page.data.staff,
          }))
        }
      } catch (cause) {
        if (
          requestGeneration === generation.current &&
          cause.name !== 'AbortError'
        )
          setError(cause.message)
      } finally {
        if (requestGeneration === generation.current) setBusy(false)
      }
    },
    [companyId, orderId, filter, querySearch, scope, board, requestKey]
  )
  useEffect(() => {
    setData({ tasks: [], staff: [], roles: [] })
    setDraft(null)
    setEditing(null)
    setNotice(null)
    setSearch('')
    setQuerySearch('')
    setScope('all')
    setView('list')
    preferenceIdentity.current = ''
  }, [companyId, orderId])
  useEffect(() => {
    load()
    return () => {
      generation.current += 1
      controller.current?.abort()
    }
  }, [load])
  useEffect(() => {
    if (compact || !data.currentStaffId) return
    const identity = `${companyId}:${data.currentStaffId}`
    if (preferenceIdentity.current === identity) return
    preferenceIdentity.current = identity
    let storage
    try {
      storage = window.localStorage
    } catch {
      /* Storage is optional. */
    }
    const preferred = readPartyTaskView(
      storage,
      companyId,
      data.currentStaffId,
      window.matchMedia('(max-width: 767px)').matches
    )
    setView(preferred)
    if (preferred === 'board')
      setFilter((previous) => (previous === 'open' ? 'all' : previous))
  }, [companyId, data.currentStaffId, compact])
  const changeView = (nextView) => {
    setView(nextView)
    if (nextView === 'board' && filter === 'open') setFilter('all')
    try {
      savePartyTaskView(
        window.localStorage,
        companyId,
        data.currentStaffId,
        nextView
      )
    } catch {
      /* Storage is optional. */
    }
  }
  usePartyUnsavedChanges(dirty, {
    label: 'задача',
    scope: companyId,
    pending: uploading || pendingAction || (busy && Boolean(draft)),
  })
  const mutate = async (task, patch) => {
    const requestGeneration = generation.current
    setPendingAction(true)
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
        if (requestGeneration !== generation.current) return
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
      await apiJson(`/api/party/tasks/${task._id}`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ revision: task.revision, ...patch }),
      })
      if (requestGeneration !== generation.current) return
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
              : {
                  text:
                    patch.status === 'new'
                      ? 'Задача возвращена в новые.'
                      : 'Задача взята в работу.',
                }
      )
      onChanged?.()
      await load()
    } catch (cause) {
      if (requestGeneration !== generation.current) return
      if (cause.status === 409 || /измен|Обновите/i.test(cause.message))
        await load()
      setError(cause.message)
    } finally {
      if (requestGeneration === generation.current) setBusy(false)
      setPendingAction(false)
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
    const requestGeneration = generation.current
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
        if (requestGeneration !== generation.current) return
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
      if (requestGeneration !== generation.current) return
      const nextFilter =
        !editing || !matchesPartyTaskFilter(result.data, filter)
          ? ['done', 'canceled'].includes(result.data.status)
            ? result.data.status
            : board
              ? 'all'
              : 'open'
          : filter
      setFilter(nextFilter)
      setSearch('')
      setNotice({
        text: editing ? 'Изменения задачи сохранены.' : 'Задача создана.',
      })
      setDraft(null)
      setEditing(null)
      onChanged?.()
      if (nextFilter === filter && !querySearch) await load()
    } catch (cause) {
      if (requestGeneration === generation.current) setError(cause.message)
    } finally {
      if (requestGeneration === generation.current) setBusy(false)
    }
  }
  const applyQuickDate = (days) =>
    setDraft((previous) => ({
      ...previous,
      dueAt: partyTaskDateInput(getPartyTaskQuickDate(days)),
    }))
  const currentData = data.loadedQueryKey === requestKey
  const actionBusy = busy || pendingAction || search !== querySearch
  const tasks = [...(currentData ? data.tasks : [])].sort(
    (a, b) =>
      (a.dueAt ? +new Date(a.dueAt) : Infinity) -
      (b.dueAt ? +new Date(b.dueAt) : Infinity)
  )
  const quickFilters = [
    [board ? 'all' : 'open', board ? 'Все статусы' : 'Открытые'],
    ['overdue', 'Просрочено'],
    ['today', 'Сегодня'],
    ['undated', 'Без срока'],
  ]
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
          {!compact && !draft && (
            <div
              role="group"
              aria-label="Вид задач"
              className="flex rounded-lg border border-slate-200 bg-white p-1"
            >
              {[
                ['board', 'Доска'],
                ['list', 'Список'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={view === value}
                  disabled={pendingAction}
                  className={`min-h-11 cursor-pointer rounded-md px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${view === value ? 'bg-sky-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => changeView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <select
            aria-label="Статус задач"
            className={`${control} w-auto cursor-pointer`}
            value={filter}
            disabled={pendingAction || Boolean(draft)}
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
              disabled={actionBusy}
              onClick={() => begin()}
            >
              + Задача
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={actionBusy || Boolean(draft)}
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
              disabled={pendingAction || Boolean(draft)}
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
                disabled={pendingAction}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {search && (
              <button
                type="button"
                className={button}
                aria-label="Очистить поиск задач"
                disabled={pendingAction}
                onClick={() => setSearch('')}
              >
                Сбросить
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="Назначение задач"
            className="flex flex-wrap gap-2"
          >
            {[
              ['all', 'Все доступные'],
              ['mine', 'Мои'],
              ['role', 'Моей должности'],
              ['created', 'Поставленные мной'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={scope === value}
                disabled={pendingAction}
                className={`min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${scope === value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setScope(value)}
              >
                {label}
              </button>
            ))}
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
                disabled={pendingAction}
                className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${filter === value ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {currentData && !draft && !board && data.nextCursor && (
            <p className="text-xs text-slate-500">
              Показано {tasks.length} задач. Остальные совпадения доступны по
              кнопке «Показать ещё».
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
                if (
                  !dirty ||
                  window.confirm('Закрыть редактор без сохранения?')
                ) {
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
      {!draft && !error && (busy || !currentData) && !tasks.length && (
        <p role="status" className="p-3 text-sm text-slate-500">
          Загрузка задач…
        </p>
      )}
      {currentData && !draft && !board && !busy && !error && !tasks.length && (
        <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 p-5 text-sm text-slate-600">
          <p>
            {data.nextCursor
              ? 'В этой части списка совпадений нет. Загрузите следующую страницу, чтобы продолжить поиск.'
              : search
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
      {!draft && board && currentData ? (
        <PartyTaskBoard
          columns={currentData ? data.columns : {}}
          busy={actionBusy || !currentData || Boolean(error)}
          onLoadMore={load}
          onMutate={mutate}
          onEdit={begin}
          editing={Boolean(draft)}
          staffById={staffById}
          rolesById={rolesById}
          actionsName={`${formId}-task-actions`}
        />
      ) : !draft && !board ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <PartyTaskCard
              key={task._id}
              task={task}
              staffById={staffById}
              rolesById={rolesById}
              busy={actionBusy}
              editing={Boolean(draft)}
              onEdit={begin}
              onMutate={mutate}
              actionsName={`${formId}-task-actions`}
            />
          ))}
        </div>
      ) : null}
      {currentData && !draft && !board && data.nextCursor && (
        <button
          type="button"
          className={button}
          disabled={actionBusy}
          onClick={() => load(data.nextCursor)}
        >
          Показать ещё
        </button>
      )}
    </section>
  )
}
