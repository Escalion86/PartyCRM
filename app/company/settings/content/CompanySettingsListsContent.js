'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import useCompanySettings from '../useCompanySettings'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const normalizeList = (items = []) =>
  Array.from(
    new Set(
      items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

function DictionarySection({
  title,
  subtitle,
  emptyLabel,
  promptLabel,
  field,
  items,
  saving,
  savePatch,
}) {
  const serverItems = useMemo(() => normalizeList(items), [items])
  const [localItems, setLocalItems] = useState(serverItems)
  const normalizedItems = useMemo(() => normalizeList(localItems), [localItems])
  const changed = useMemo(
    () => JSON.stringify(normalizedItems) !== JSON.stringify(serverItems),
    [normalizedItems, serverItems]
  )
  usePartyUnsavedChanges(changed, { label: title, pending: saving })

  const handleAdd = () => {
    const newValue = window.prompt(promptLabel)
    const trimmed = newValue?.trim()
    if (!trimmed) return
    setLocalItems((prev) => normalizeList([...prev, trimmed]))
  }

  const handleDelete = (value) => {
    setLocalItems((prev) =>
      normalizeList(prev.filter((item) => item !== value))
    )
  }

  const handleSave = async () => {
    try {
      await savePatch({ [field]: normalizedItems })
    } catch {
      // ошибка уже выставлена в хуке useCompanySettings
    }
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-slate-500">
            {subtitle ? `${subtitle} · ` : ''}Элементов:{' '}
            {normalizedItems.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-sky-200 text-sky-600 transition hover:bg-sky-50"
            title={promptLabel}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
          </button>
          {changed && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Сохранить
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
        {normalizedItems.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            {emptyLabel}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {normalizedItems.map((value) => (
              <div
                key={value}
                className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0"
              >
                <div className="text-sm font-medium text-gray-800">{value}</div>
                <button
                  type="button"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-red-200 text-red-500 transition hover:bg-red-50"
                  onClick={() => handleDelete(value)}
                  title="Удалить"
                >
                  <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CompanySettingsListsContent({ activeCompanyId }) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)

  // ---- Towns state ----
  const [towns, setTowns] = useState([])
  const [defaultTown, setDefaultTown] = useState('')
  const townsInitialSyncDone = useRef(false)
  const serverTowns = useMemo(
    () => normalizeList(settings?.towns ?? []),
    [settings?.towns]
  )
  const normalizedTowns = useMemo(() => normalizeList(towns), [towns])

  const townsChanged = useMemo(() => {
    const a = JSON.stringify(normalizedTowns)
    const b = JSON.stringify(serverTowns)
    return a !== b || (settings?.defaultTown ?? '') !== (defaultTown ?? '')
  }, [normalizedTowns, serverTowns, settings?.defaultTown, defaultTown])
  usePartyUnsavedChanges(Boolean(settings && townsChanged), {
    label: 'города компании',
    scope: activeCompanyId,
    pending: saving,
  })

  // Sync from server: always on first data arrival, then only when unchanged
  useEffect(() => {
    let canceled = false
    const syncTowns = () => {
      if (canceled) return
      setTowns(serverTowns)
      setDefaultTown(settings?.defaultTown ?? '')
    }

    if (!townsInitialSyncDone.current && settings !== null) {
      townsInitialSyncDone.current = true
      queueMicrotask(syncTowns)
      return () => {
        canceled = true
      }
    }
    if (!townsChanged) queueMicrotask(syncTowns)
    return () => {
      canceled = true
    }
  }, [townsChanged, serverTowns, settings])

  const handleAddTown = () => {
    const newTown = window.prompt('Новый город')
    const trimmed = newTown?.trim()
    if (!trimmed) return
    setTowns((prev) => normalizeList([...prev, trimmed]))
    if (!defaultTown) setDefaultTown(trimmed)
  }

  const handleDeleteTown = (town) => {
    setTowns((prev) => normalizeList(prev.filter((item) => item !== town)))
    if (defaultTown === town) setDefaultTown('')
  }

  const handleSaveTowns = useCallback(async () => {
    try {
      const safeDefault =
        defaultTown && normalizedTowns.includes(defaultTown) ? defaultTown : ''
      await savePatch({ towns: normalizedTowns, defaultTown: safeDefault })
    } catch {
      // ошибка уже выставлена в хуке useCompanySettings
    }
  }, [defaultTown, normalizedTowns, savePatch])

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем списки компании...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/10 text-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      ) : null}

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}

      {/* ---- Towns ---- */}
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Города</div>
            <div className="text-xs text-slate-500">
              По умолчанию:{' '}
              <span className="font-semibold text-slate-700">
                {defaultTown || 'Не выбран'}
              </span>
              {' · '}
              Элементов: {normalizedTowns.length}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddTown}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-sky-200 text-sky-600 transition hover:bg-sky-50"
              title="Добавить город"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            </button>
            {townsChanged && (
              <button
                type="button"
                onClick={handleSaveTowns}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
              >
                Сохранить
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
          {normalizedTowns.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400">
              Городов пока нет
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {normalizedTowns.map((town) => {
                const isDefault = defaultTown === town
                return (
                  <div
                    key={town}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-gray-300 text-transparent transition hover:border-emerald-500"
                        onClick={() => setDefaultTown(town)}
                        title="Сделать городом по умолчанию"
                      >
                        {isDefault && (
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="h-3 w-3 text-emerald-600"
                          />
                        )}
                      </button>
                      <div className="text-sm font-medium text-gray-800">
                        {town}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDefault && (
                        <span className="text-xs text-emerald-600">
                          По умолчанию
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-red-200 text-red-500 transition hover:bg-red-50"
                        onClick={() => handleDeleteTown(town)}
                        title="Удалить город"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <DictionarySection
        key={`orderTypes-${JSON.stringify(settings?.orderTypes ?? [])}`}
        title="Типы заказов"
        subtitle="Используется в редакторе заказа и заголовке карточки заказа"
        emptyLabel="Типов заказов пока нет"
        promptLabel="Новый тип заказа"
        field="orderTypes"
        items={settings?.orderTypes ?? []}
        saving={saving}
        savePatch={savePatch}
      />

      <DictionarySection
        key={`leadSources-${JSON.stringify(settings?.leadSources ?? [])}`}
        title="Источники заявок"
        subtitle="Используется в карточке клиента"
        emptyLabel="Источников пока нет"
        promptLabel="Новый источник заявки"
        field="leadSources"
        items={settings?.leadSources ?? []}
        saving={saving}
        savePatch={savePatch}
      />
    </div>
  )
}
