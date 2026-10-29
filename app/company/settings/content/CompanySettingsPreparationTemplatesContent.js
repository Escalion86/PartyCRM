'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'

const control =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const emptyItem = () => ({
  id: crypto.randomUUID(),
  title: '',
  descriptionHtml: '',
  assigneeStaffIds: [],
  assigneeRoleId: null,
  offsetMinutes: -1440,
})
const signature = (draft) => JSON.stringify(draft)
const escape = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const descriptionText = (value) =>
  String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\n$/, '')

function TemplateDeadlineEditor({ value, onChange }) {
  const bestUnit = (minutes) =>
    minutes && Math.abs(minutes) % 1440 === 0
      ? 1440
      : minutes && Math.abs(minutes) % 60 === 0
        ? 60
        : 1
  const [unit, setUnit] = useState(() => bestUnit(value))
  const [mode, setMode] = useState(() =>
    value === null
      ? 'none'
      : value === 0
        ? 'start'
        : value < 0
          ? 'before'
          : 'after'
  )
  const chooseMode = (next) => {
    setMode(next)
    onChange(
      next === 'none'
        ? null
        : next === 'start'
          ? 0
          : (next === 'before' ? -1 : 1) * (Math.abs(Number(value)) || unit)
    )
  }
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          Срок
          <select
            className={control + ' cursor-pointer'}
            value={mode}
            onChange={(event) => chooseMode(event.target.value)}
          >
            <option value="before">До начала</option>
            <option value="after">После начала</option>
            <option value="start">К началу</option>
            <option value="none">Без срока</option>
          </select>
        </label>
        {['before', 'after'].includes(mode) ? (
          <>
            <label className="block text-sm">
              За сколько
              <input
                className={control}
                type="number"
                min={0}
                max={527040 / unit}
                step="any"
                value={value === '' ? '' : Math.abs(Number(value)) / unit}
                onChange={(event) =>
                  onChange(
                    event.target.value === ''
                      ? ''
                      : (mode === 'before' ? -1 : 1) *
                          Math.round(Number(event.target.value) * unit)
                  )
                }
              />
            </label>
            <label className="block text-sm">
              Единица
              <select
                className={control + ' cursor-pointer'}
                value={unit}
                onChange={(event) => setUnit(Number(event.target.value))}
              >
                <option value={1}>Минут</option>
                <option value={60}>Часов</option>
                <option value={1440}>Дней</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {[-1440, -180, -60, 0].map((minutes) => (
          <button
            type="button"
            className={button}
            key={minutes}
            onClick={() => {
              setUnit(bestUnit(minutes))
              setMode(minutes === 0 ? 'start' : 'before')
              onChange(minutes)
            }}
          >
            {minutes === 0
              ? 'К началу'
              : minutes === -1440
                ? 'За сутки'
                : minutes === -180
                  ? 'За 3 часа'
                  : 'За час'}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CompanySettingsPreparationTemplatesContent(props) {
  return <PreparationTemplatesSettings key={props.activeCompanyId} {...props} />
}

function PreparationTemplatesSettings({ activeCompanyId }) {
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const submitting = useRef(false)
  const headers = { 'x-partycrm-company-id': activeCompanyId }
  const dirty = Boolean(draft && signature(draft) !== saved)
  usePartyUnsavedChanges(dirty, {
    label: 'шаблон задач',
    scope: activeCompanyId,
    pending: busy,
  })
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    apiJson('/api/party/preparation-templates?manage=1', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'x-partycrm-company-id': activeCompanyId },
    })
      .then((response) => {
        if (generation.current === current) setData(response.data)
      })
      .catch((cause) => {
        if (generation.current === current && cause.name !== 'AbortError')
          setError(cause.message || 'Не удалось загрузить шаблоны')
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [activeCompanyId])
  const choose = (template) => {
    if (busy || (dirty && !requestPartyLeave({ label: 'шаблон задач' }))) return
    const next = template || { title: '', active: true, items: [emptyItem()] }
    setDraft(structuredClone(next))
    setSaved(template ? signature(next) : '')
    setError('')
    setNotice('')
  }
  const edit = (patch) => {
    setDraft((previous) => ({ ...previous, ...patch }))
    setNotice('')
  }
  const itemEdit = (id, patch) =>
    edit({
      items: draft.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    })
  const save = async () => {
    if (busy || submitting.current || !draft || !dirty) return
    const current = generation.current
    submitting.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiJson(
        draft._id
          ? `/api/party/preparation-templates/${draft._id}`
          : '/api/party/preparation-templates',
        {
          method: draft._id ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify({ ...draft, expectedRevision: draft.revision }),
        }
      )
      if (generation.current !== current) return
      setData((previous) => ({
        ...previous,
        templates: [
          ...previous.templates.filter(
            (template) => template._id !== result.data._id
          ),
          result.data,
        ],
      }))
      setDraft(result.data)
      setSaved(signature(result.data))
      setNotice('Шаблон сохранён. Ранее созданные задачи не изменились.')
    } catch (cause) {
      if (generation.current === current)
        setError(cause.message || 'Не удалось сохранить шаблон')
    } finally {
      submitting.current = false
      if (generation.current === current) setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Сохраните повторяющиеся задачи подготовки, назначьте сотрудников или
        должность и задайте сроки относительно начала мероприятия. В заказе
        сотрудник явно проверяет и применяет набор. Существующие задачи и сроки
        сохраняются, даже если шаблон или дата заказа изменятся.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {!data ? (
        <p role="status" className="text-sm text-slate-500">
          {error ? 'Шаблоны недоступны.' : 'Загрузка шаблонов…'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || !data.canManage || data.templates.length >= 100}
              onClick={() => choose(null)}
            >
              Создать шаблон
            </button>
            {data.templates.map((template) => (
              <button
                type="button"
                key={template._id}
                className={
                  button + (draft?._id === template._id ? ' bg-sky-50' : '')
                }
                disabled={busy}
                aria-pressed={draft?._id === template._id}
                onClick={() => choose(template)}
              >
                {template.title}
                {template.active === false ? ' · архив' : ''}
              </button>
            ))}
          </div>
          {!data.templates.length && !draft ? (
            <p className="text-sm text-slate-500">
              Шаблонов пока нет. Например: подготовка реквизита, связь с
              командой и проверка готовности.
            </p>
          ) : null}
          {draft ? (
            <fieldset
              disabled={busy || !data.canManage}
              className="space-y-4 rounded-xl border border-sky-100 p-3 sm:p-4"
            >
              <legend className="px-2 font-semibold">
                {draft._id ? 'Редактирование шаблона' : 'Новый шаблон'}
              </legend>
              <label className="block text-sm">
                Название
                <input
                  className={control}
                  maxLength={180}
                  value={draft.title}
                  onChange={(event) => edit({ title: event.target.value })}
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(event) => edit({ active: event.target.checked })}
                />
                Доступен для применения в заказах
              </label>
              {draft.items.map((item, index) => (
                <div
                  key={item.id}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <label className="block text-sm">
                    Задача {index + 1}
                    <input
                      className={control}
                      maxLength={240}
                      value={item.title}
                      onChange={(event) =>
                        itemEdit(item.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Описание
                    <textarea
                      className={control}
                      maxLength={10000}
                      rows={2}
                      value={descriptionText(item.descriptionHtml)}
                      onChange={(event) =>
                        itemEdit(item.id, {
                          descriptionHtml: event.target.value
                            ? `<p>${escape(event.target.value).replaceAll('\n', '<br>')}</p>`
                            : '',
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Кому назначить
                    <select
                      className={control + ' cursor-pointer'}
                      value={item.assigneeRoleId ? 'role' : 'staff'}
                      onChange={(event) =>
                        itemEdit(item.id, {
                          assigneeRoleId:
                            event.target.value === 'role'
                              ? data.roles[0]?._id || null
                              : null,
                          assigneeStaffIds: [],
                        })
                      }
                    >
                      <option value="staff">Конкретным сотрудникам</option>
                      <option value="role" disabled={!data.roles.length}>
                        Всем сотрудникам должности
                      </option>
                    </select>
                  </label>
                  {item.assigneeRoleId ? (
                    <label className="block text-sm">
                      Должность
                      <select
                        className={control + ' cursor-pointer'}
                        value={item.assigneeRoleId}
                        onChange={(event) =>
                          itemEdit(item.id, {
                            assigneeRoleId: event.target.value,
                          })
                        }
                      >
                        {!data.roles.some(
                          (role) => role._id === item.assigneeRoleId
                        ) ? (
                          <option value={item.assigneeRoleId}>
                            Недоступная должность — замените
                          </option>
                        ) : null}
                        {data.roles.map((role) => (
                          <option key={role._id} value={role._id}>
                            {role.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <fieldset className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      <legend className="px-1 text-sm">
                        Ответственные · {item.assigneeStaffIds.length}
                      </legend>
                      {data.staff.map((person) => (
                        <label
                          key={person._id}
                          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={item.assigneeStaffIds.includes(person._id)}
                            onChange={(event) =>
                              itemEdit(item.id, {
                                assigneeStaffIds: event.target.checked
                                  ? [...item.assigneeStaffIds, person._id]
                                  : item.assigneeStaffIds.filter(
                                      (id) => id !== person._id
                                    ),
                              })
                            }
                          />
                          {person.name}
                        </label>
                      ))}
                      {item.assigneeStaffIds.some(
                        (id) => !data.staff.some((person) => person._id === id)
                      ) ? (
                        <p className="text-xs text-amber-900">
                          В назначении есть недоступные сотрудники.{' '}
                          <button
                            type="button"
                            className="min-h-11 cursor-pointer font-semibold underline"
                            onClick={() =>
                              itemEdit(item.id, {
                                assigneeStaffIds: item.assigneeStaffIds.filter(
                                  (id) =>
                                    data.staff.some(
                                      (person) => person._id === id
                                    )
                                ),
                              })
                            }
                          >
                            Убрать их
                          </button>
                        </p>
                      ) : null}
                      {!data.staff.length ? (
                        <p className="text-sm text-slate-500">
                          Нет действующих сотрудников
                        </p>
                      ) : null}
                    </fieldset>
                  )}
                  <TemplateDeadlineEditor
                    key={`${draft._id || 'new'}:${item.id}`}
                    value={item.offsetMinutes}
                    onChange={(offsetMinutes) =>
                      itemEdit(item.id, { offsetMinutes })
                    }
                  />
                  <button
                    type="button"
                    className={button}
                    disabled={draft.items.length <= 1}
                    onClick={() =>
                      edit({
                        items: draft.items.filter(
                          (entry) => entry.id !== item.id
                        ),
                      })
                    }
                  >
                    Убрать задачу
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={draft.items.length >= 30}
                  onClick={() => edit({ items: [...draft.items, emptyItem()] })}
                >
                  Добавить задачу
                </button>
                <button
                  type="button"
                  className={button + ' bg-sky-50'}
                  disabled={!dirty}
                  onClick={save}
                >
                  {busy ? 'Сохранение…' : 'Сохранить шаблон'}
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    if (
                      !dirty ||
                      requestPartyLeave({ label: 'шаблон задач' })
                    ) {
                      setDraft(null)
                      setSaved('')
                      setError('')
                    }
                  }}
                >
                  Закрыть
                </button>
              </div>
            </fieldset>
          ) : null}
        </>
      )}
    </div>
  )
}
