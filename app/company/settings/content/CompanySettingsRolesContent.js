'use client'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import {
  getPartyDefaultRolePermissions,
  PARTY_ROLE_PERMISSION_GROUPS,
  PARTY_ROLE_PERMISSIONS,
} from '@helpers/partyRolePermissions'

const control =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-50'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const statusOptions = [
  ['draft', 'Заявка'],
  ['active', 'Подтверждён'],
  ['canceled', 'Отменён'],
  ['closed', 'Закрыт'],
]
const newRole = () => ({
  title: '',
  description: '',
  baseRole: 'performer',
  permissions: getPartyDefaultRolePermissions('performer'),
  orderScope: {
    stageIds: [],
    statuses: [],
    locationIds: [],
    includeUnlocated: true,
    assignedOnly: true,
  },
  active: true,
})
const clone = (value) => JSON.parse(JSON.stringify(value))
const roleValues = (role) =>
  role && {
    title: role.title,
    description: role.description || '',
    permissions: role.permissions || {},
    orderScope: role.orderScope || {},
    active: role.active !== false,
  }
const searchable = (value) =>
  String(value || '')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
const levelOf = (row, role) =>
  row.actionOnly && role?.permissions?.[row.key] !== 'edit'
    ? 'hidden'
    : role?.permissions?.[row.key] || 'hidden'
const groupRows = new Map(
  PARTY_ROLE_PERMISSION_GROUPS.map((group) => [
    group.key,
    PARTY_ROLE_PERMISSIONS.filter((row) => row.group === group.key),
  ])
)

export default function CompanySettingsRolesContent({ activeCompanyId }) {
  const [roles, setRoles] = useState([])
  const [locations, setLocations] = useState([])
  const [stages, setStages] = useState([])
  const [draft, setDraft] = useState(null)
  const [original, setOriginal] = useState(null)
  const [busy, setBusy] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState([])
  const [scopeExpanded, setScopeExpanded] = useState(false)
  const companyRef = useRef(activeCompanyId)
  const previousRoleRef = useRef(null)
  companyRef.current = activeCompanyId
  const headers = { 'x-partycrm-company-id': activeCompanyId }
  const dirty = Boolean(
    draft &&
    (JSON.stringify(roleValues(draft)) !==
      JSON.stringify(roleValues(original)) ||
      (!draft._id && draft.title.trim()))
  )

  useEffect(() => {
    let alive = true
    setBusy(true)
    setError('')
    setNotice('')
    setRoles([])
    setLocations([])
    setStages([])
    setDraft(null)
    setOriginal(null)
    setCanManage(false)
    const headers = { 'x-partycrm-company-id': activeCompanyId }
    Promise.allSettled([
      apiJson('/api/party/roles', { cache: 'no-store', headers }),
      apiJson('/api/party/locations', { cache: 'no-store', headers }),
      apiJson('/api/party/workflow', { cache: 'no-store', headers }),
    ]).then(([roleResult, locationResult, workflowResult]) => {
      if (!alive) return
      if (roleResult.status === 'fulfilled') {
        setRoles(roleResult.value.data || [])
        setCanManage(roleResult.value.canManage === true)
        const initial = clone(roleResult.value.data?.[0] || newRole())
        setDraft(initial)
        setOriginal(clone(initial))
        previousRoleRef.current = initial._id ? clone(initial) : null
      } else
        setError(roleResult.reason?.message || 'Не удалось загрузить должности')
      if (locationResult.status === 'fulfilled')
        setLocations(locationResult.value.data || [])
      if (workflowResult.status === 'fulfilled')
        setStages(workflowResult.value.data?.stages || [])
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [activeCompanyId])

  usePartyUnsavedChanges(dirty, {
    label: 'должности',
    scope: activeCompanyId,
    pending: busy && Boolean(draft),
  })

  const locked = !canManage || draft?.systemKey === 'owner' || busy
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setNotice('')
  }
  const scope = draft?.orderScope || {}
  const setScope = (key, value) => {
    setDraft((previous) => ({
      ...previous,
      orderScope: { ...previous.orderScope, [key]: value },
    }))
    setNotice('')
  }
  const toggleScope = (key, value) =>
    setScope(
      key,
      (scope[key] || []).map(String).includes(value)
        ? scope[key].filter((item) => String(item) !== value)
        : [...(scope[key] || []), value]
    )
  const selectRole = (role) => {
    if (
      dirty &&
      !window.confirm(
        'Есть несохранённые изменения должности. Переключиться без сохранения?'
      )
    )
      return
    if (role._id) previousRoleRef.current = clone(role)
    else if (original?._id) previousRoleRef.current = clone(original)
    setDraft(clone(role))
    setOriginal(clone(role))
    setNotice('')
    setError('')
  }
  const setGroup = (group, level) => {
    setDraft((previous) => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        ...Object.fromEntries(
          groupRows
            .get(group)
            .map((row) => [
              row.key,
              row.actionOnly && level === 'read' ? 'hidden' : level,
            ])
        ),
      },
    }))
    setNotice('')
  }
  const counts = (rows) =>
    rows.reduce(
      (result, row) => {
        result[levelOf(row, draft)] += 1
        return result
      },
      { hidden: 0, read: 0, edit: 0 }
    )
  const totals = counts(PARTY_ROLE_PERMISSIONS)
  const query = searchable(search.trim())
  const visibleGroups = PARTY_ROLE_PERMISSION_GROUPS.map((group) => ({
    ...group,
    rows: groupRows
      .get(group.key)
      .filter(
        (row) =>
          !query ||
          searchable(`${group.label} ${row.label} ${row.key}`).includes(query)
      ),
  })).filter((group) => group.rows.length)
  const changedPermissions = PARTY_ROLE_PERMISSIONS.filter(
    (row) => levelOf(row, draft) !== levelOf(row, original)
  ).length
  const scopeSummary = [
    scope.assignedOnly ? 'Свои назначения' : 'Все заказы',
    scope.statuses?.length
      ? `Статусов: ${scope.statuses.length}`
      : 'Все статусы',
    scope.stageIds?.length ? `Этапов: ${scope.stageIds.length}` : 'Все этапы',
    scope.locationIds?.length
      ? `Площадок: ${scope.locationIds.length}`
      : 'Все площадки',
    scope.includeUnlocated === false ? 'Только с площадкой' : 'Включая выезды',
  ].join(' · ')

  const save = async () => {
    if (locked || !draft?.title.trim()) return
    const savingCompany = activeCompanyId
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        title: draft.title,
        description: draft.description || '',
        permissions: draft.permissions,
        orderScope: draft.orderScope,
        active: draft.active !== false,
        ...(draft._id ? { expectedRevision: draft.revision } : {}),
      }
      const result = await apiJson(
        `/api/party/roles${draft._id ? `/${draft._id}` : ''}`,
        {
          method: draft._id ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify(payload),
        }
      )
      if (companyRef.current !== savingCompany) return
      setRoles((previous) =>
        draft._id
          ? previous.map((role) =>
              String(role._id) === String(draft._id) ? result.data : role
            )
          : [...previous, result.data]
      )
      setDraft(clone(result.data))
      setOriginal(clone(result.data))
      previousRoleRef.current = clone(result.data)
      setNotice(
        'Должность сохранена. Права применяются к следующим запросам сотрудников.'
      )
      window.dispatchEvent(new Event('partycrm-company-change'))
    } catch (failure) {
      if (companyRef.current === savingCompany)
        setError(failure.message || 'Не удалось сохранить должность')
    } finally {
      if (companyRef.current === savingCompany) setBusy(false)
    }
  }

  if (busy && !draft)
    return (
      <p role="status" className="p-4 text-sm text-slate-500">
        Загрузка должностей…
      </p>
    )
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        У сотрудника одна должность. Настройте видимость полей, действия и
        доступные заказы, затем назначьте должность в карточке сотрудника.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm">
          Должность
          <select
            className={`${control} cursor-pointer`}
            value={draft?._id || ''}
            disabled={busy}
            onChange={(event) =>
              selectRole(
                roles.find((role) => String(role._id) === event.target.value) ||
                  newRole()
              )
            }
          >
            <option value="">Новая должность</option>
            {roles.map((role) => (
              <option key={role._id} value={String(role._id)}>
                {role.title}
                {role.systemKey ? ' · системная' : ''}
                {role.active === false ? ' · отключена' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className={button}
          disabled={!canManage || busy}
          onClick={() => selectRole(newRole())}
        >
          Добавить должность
        </button>
        <button
          className={button}
          disabled={!canManage || !draft || busy}
          onClick={() =>
            selectRole({
              ...clone(draft),
              _id: undefined,
              systemKey: null,
              baseRole: 'performer',
              title: `${draft.title} (копия)`,
              revision: 0,
              active: true,
            })
          }
        >
          Создать копию
        </button>
      </div>
      {draft && (
        <>
          {draft.systemKey === 'owner' && (
            <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              Владелец сохраняет полный доступ. Создайте копию, чтобы
              использовать эту должность как основу.
            </p>
          )}
          {!canManage && (
            <p className="text-sm text-amber-800">
              Изменение должностей доступно руководителю с правом управления
              должностями.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Название
              <input
                className={control}
                maxLength={100}
                value={draft.title}
                disabled={locked}
                onChange={(event) => set('title', event.target.value)}
              />
            </label>
            <label className="text-sm">
              Описание
              <input
                className={control}
                maxLength={1000}
                value={draft.description || ''}
                disabled={locked}
                onChange={(event) => set('description', event.target.value)}
              />
            </label>
          </div>
          <details
            open={scopeExpanded}
            onToggle={(event) => setScopeExpanded(event.currentTarget.open)}
            className="rounded-xl border border-sky-100 bg-white"
          >
            <summary className="cursor-pointer px-4 py-3">
              <span className="font-semibold">Какие заказы доступны</span>
              <span className="mt-1 block text-sm leading-5 text-slate-500">
                {scopeSummary}
              </span>
            </summary>
            <fieldset
              disabled={locked}
              className="space-y-4 border-t border-sky-100 p-4"
            >
              <legend className="px-1 font-semibold">
                Ограничения заказов
              </legend>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scope.assignedOnly === true}
                  onChange={(event) =>
                    setScope('assignedOnly', event.target.checked)
                  }
                />
                Только заказы, где сотрудник назначен исполнителем или
                ответственным
              </label>
              <div>
                <p className="mb-2 text-sm font-medium">Системные статусы</p>
                <p className="mb-2 text-xs text-slate-500">
                  Если ничего не выбрано, доступны все статусы.
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {statusOptions.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-10 items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={(scope.statuses || []).includes(value)}
                        onChange={() => toggleScope('statuses', value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Этапы заказа</p>
                <p className="mb-2 text-xs text-slate-500">
                  Если ничего не выбрано, доступны все этапы.
                </p>
                {stages.length ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {stages.map((stage) => (
                      <label
                        key={stage.id || stage._id}
                        className="flex min-h-10 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={(scope.stageIds || []).includes(
                            String(stage.id || stage._id)
                          )}
                          onChange={() =>
                            toggleScope(
                              'stageIds',
                              String(stage.id || stage._id)
                            )
                          }
                        />
                        {stage.title}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Настройте этапы заказа в компании. Сохранённые ограничения
                    этапов сохраняются.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Площадки</p>
                <p className="mb-2 text-xs text-slate-500">
                  Если площадки не выбраны, ограничений по площадкам нет.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {locations
                    .filter((location) => location.status !== 'archived')
                    .map((location) => (
                      <label
                        key={location._id}
                        className="flex min-h-10 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={(scope.locationIds || [])
                            .map(String)
                            .includes(String(location._id))}
                          onChange={() =>
                            toggleScope('locationIds', String(location._id))
                          }
                        />
                        {location.title}
                      </label>
                    ))}
                </div>
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scope.includeUnlocated !== false}
                  onChange={(event) =>
                    setScope('includeUnlocated', event.target.checked)
                  }
                />
                Заказы без выбранной площадки и выезды
              </label>
            </fieldset>
          </details>
          <section className="space-y-3" aria-label="Права должности">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Разделы, поля и действия
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Откройте нужный раздел или найдите конкретное право.
                </p>
              </div>
              <div
                className="flex flex-wrap gap-2 text-xs"
                aria-label="Сводка прав"
              >
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                  Скрыто: {totals.hidden}
                </span>
                <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-800">
                  Просмотр: {totals.read}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
                  Изменение и действия: {totals.edit}
                </span>
              </div>
            </div>
            <div className="space-y-2 sm:flex sm:flex-wrap sm:items-end sm:gap-2 sm:space-y-0">
              <label className="block min-w-0 flex-1 text-sm">
                Найти право или раздел
                <input
                  type="search"
                  className={control}
                  placeholder="Например, телефон, выплаты или реквизит"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {search && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => setSearch('')}
                  >
                    Сбросить поиск
                  </button>
                )}
                {!query && (
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      setExpandedGroups(
                        expandedGroups.length ===
                          PARTY_ROLE_PERMISSION_GROUPS.length
                          ? []
                          : PARTY_ROLE_PERMISSION_GROUPS.map(
                              (group) => group.key
                            )
                      )
                    }
                  >
                    {expandedGroups.length ===
                    PARTY_ROLE_PERMISSION_GROUPS.length
                      ? 'Свернуть всё'
                      : 'Раскрыть всё'}
                  </button>
                )}
              </div>
            </div>
            {query && (
              <p role="status" className="text-sm text-slate-500">
                Найдено прав:{' '}
                {visibleGroups.reduce(
                  (total, group) => total + group.rows.length,
                  0
                )}
              </p>
            )}
            {!visibleGroups.length && (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Такого права нет. Попробуйте название поля или раздела.
              </p>
            )}
            <div className="space-y-3">
              {visibleGroups.map((group) => {
                const summary = counts(groupRows.get(group.key))
                return (
                  <details
                    key={group.key}
                    open={Boolean(query) || expandedGroups.includes(group.key)}
                    onToggle={(event) => {
                      if (query) return
                      const open = event.currentTarget.open
                      setExpandedGroups((previous) =>
                        open
                          ? previous.includes(group.key)
                            ? previous
                            : [...previous, group.key]
                          : previous.filter((key) => key !== group.key)
                      )
                    }}
                    className="overflow-hidden rounded-xl border border-sky-100 bg-white"
                  >
                    <summary className="min-h-11 cursor-pointer px-4 py-3">
                      <span className="font-semibold">{group.label}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        Доступно {summary.read + summary.edit} из{' '}
                        {groupRows.get(group.key).length}
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-sky-50 bg-slate-50/60 px-4 py-3">
                      {query ? (
                        <p className="text-xs leading-5 text-slate-500">
                          Сейчас показаны найденные права. Для настройки всего
                          раздела сбросьте поиск.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">
                              Весь раздел:
                            </span>
                            {[
                              ['hidden', 'Скрыть'],
                              ['read', 'Просмотр'],
                              ['edit', 'Изменение'],
                            ].map(([level, label]) => (
                              <button
                                key={level}
                                type="button"
                                disabled={locked}
                                className={button}
                                onClick={() => setGroup(group.key, level)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs leading-5 text-slate-500">
                            «Просмотр» запрещает действия — создание, назначение
                            и другие операции.
                          </p>
                        </>
                      )}
                    </div>
                    <div className="divide-y divide-slate-100 px-4">
                      {group.rows.map((row) => (
                        <label
                          key={row.key}
                          className="flex min-h-14 flex-col justify-between gap-1 py-2 text-sm sm:flex-row sm:items-center sm:gap-4"
                        >
                          <span>
                            {row.label}
                            {row.actionOnly && (
                              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                                действие
                              </span>
                            )}
                          </span>
                          <select
                            aria-label={row.label}
                            className="min-h-11 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50 sm:w-44"
                            disabled={locked}
                            value={levelOf(row, draft)}
                            onChange={(event) =>
                              set('permissions', {
                                ...draft.permissions,
                                [row.key]: event.target.value,
                              })
                            }
                          >
                            <option value="hidden">
                              {row.actionOnly ? 'Запрещено' : 'Скрыто'}
                            </option>
                            {!row.actionOnly && (
                              <option value="read">Просмотр</option>
                            )}
                            <option value="edit">
                              {row.actionOnly ? 'Разрешено' : 'Изменение'}
                            </option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          </section>
          {!draft.systemKey && (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={locked}
                checked={draft.active !== false}
                onChange={(event) => set('active', event.target.checked)}
              />
              Должность активна. Для отключения сначала переведите сотрудников
              на другую должность.
            </label>
          )}
          {draft.systemKey !== 'owner' && canManage && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 bg-white py-3">
              <p role="status" className="min-w-0 text-sm text-slate-500">
                {!draft._id
                  ? 'Новая должность'
                  : dirty
                    ? `Есть несохранённые изменения${changedPermissions ? ` · прав: ${changedPermissions}` : ''}`
                    : 'Все изменения сохранены'}
              </p>
              <div className="flex flex-wrap gap-2">
                {dirty && (
                  <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() => {
                      const restored = !draft._id
                        ? roles.find(
                            (role) =>
                              String(role._id) ===
                              String(previousRoleRef.current?._id)
                          ) ||
                          roles[0] ||
                          newRole()
                        : original
                      setDraft(clone(restored))
                      setOriginal(clone(restored))
                      setError('')
                      setNotice('')
                    }}
                  >
                    {draft._id ? 'Отменить изменения' : 'Отменить создание'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    locked ||
                    !draft.title.trim() ||
                    Boolean(draft._id && !dirty)
                  }
                  className="min-h-11 cursor-pointer rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={save}
                >
                  {busy ? 'Сохранение…' : 'Сохранить должность'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
