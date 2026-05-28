'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import useCompanySettings from '../useCompanySettings'

const normalizeList = (items = []) =>
  Array.from(
    new Set(
      items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

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

  // Sync from server: always on first data arrival, then only when unchanged
  useEffect(() => {
    if (!townsInitialSyncDone.current && settings !== null) {
      setTowns(serverTowns)
      setDefaultTown(settings?.defaultTown ?? '')
      townsInitialSyncDone.current = true
      return
    }
    if (townsChanged) return
    setTowns(serverTowns)
    setDefaultTown(settings?.defaultTown ?? '')
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

  // ---- Event types state ----
  const [eventTypes, setEventTypes] = useState([])
  const eventTypesInitialSyncDone = useRef(false)
  const serverEventTypes = useMemo(
    () => normalizeList(settings?.eventTypes ?? []),
    [settings?.eventTypes]
  )
  const normalizedEventTypes = useMemo(
    () => normalizeList(eventTypes),
    [eventTypes]
  )

  const eventTypesChanged = useMemo(
    () =>
      JSON.stringify(normalizedEventTypes) !== JSON.stringify(serverEventTypes),
    [normalizedEventTypes, serverEventTypes]
  )

  useEffect(() => {
    if (!eventTypesInitialSyncDone.current && settings !== null) {
      setEventTypes(serverEventTypes)
      eventTypesInitialSyncDone.current = true
      return
    }
    if (eventTypesChanged) return
    setEventTypes(serverEventTypes)
  }, [eventTypesChanged, serverEventTypes, settings])

  const handleAddEventType = () => {
    const newValue = window.prompt('Новый тип мероприятия')
    const trimmed = newValue?.trim()
    if (!trimmed) return
    setEventTypes((prev) => normalizeList([...prev, trimmed]))
  }

  const handleDeleteEventType = (value) => {
    setEventTypes((prev) =>
      normalizeList(prev.filter((item) => item !== value))
    )
  }

  const handleSaveEventTypes = useCallback(async () => {
    try {
      await savePatch({ eventTypes: normalizedEventTypes })
    } catch {
      // ошибка уже выставлена в хуке useCompanySettings
    }
  }, [normalizedEventTypes, savePatch])

  if (loading) {
    return (
      <div className="p-6 text-sm border rounded-2xl border-sky-100 bg-sky-50 text-slate-500">
        Загружаем списки компании...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="p-3 text-sm border rounded-md border-danger/30 bg-danger/10 text-danger">
          {error}
        </div>
      ) : null}

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}

      {/* ---- Towns ---- */}
      <div className="p-5 bg-white border rounded-2xl border-sky-100">
        <div className="flex items-center justify-between gap-3 mb-1">
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
              className="flex items-center justify-center w-8 h-8 transition border rounded-full cursor-pointer border-sky-200 text-sky-600 hover:bg-sky-50"
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

        <div className="mt-3 overflow-hidden border border-gray-200 rounded-lg">
          {normalizedTowns.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400">
              Городов пока нет
            </div>
          ) : (
            <div className="overflow-y-auto max-h-64">
              {normalizedTowns.map((town) => {
                const isDefault = defaultTown === town
                return (
                  <div
                    key={town}
                    className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex items-center justify-center w-5 h-5 text-transparent transition border border-gray-300 rounded cursor-pointer hover:border-emerald-500"
                        onClick={() => setDefaultTown(town)}
                        title="Сделать городом по умолчанию"
                      >
                        {isDefault && (
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="w-3 h-3 text-emerald-600"
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
                        className="flex items-center justify-center text-red-500 transition border border-red-200 rounded cursor-pointer h-7 w-7 hover:bg-red-50"
                        onClick={() => handleDeleteTown(town)}
                        title="Удалить город"
                      >
                        <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ---- Event types ---- */}
      <div className="p-5 bg-white border rounded-2xl border-sky-100">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div>
            <div className="text-sm font-semibold">Что за мероприятие?</div>
            <div className="text-xs text-slate-500">
              Элементов: {normalizedEventTypes.length}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddEventType}
              className="flex items-center justify-center w-8 h-8 transition border rounded-full cursor-pointer border-sky-200 text-sky-600 hover:bg-sky-50"
              title="Добавить тип мероприятия"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            </button>
            {eventTypesChanged && (
              <button
                type="button"
                onClick={handleSaveEventTypes}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
              >
                Сохранить
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 overflow-hidden border border-gray-200 rounded-lg">
          {normalizedEventTypes.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-400">
              Типов пока нет
            </div>
          ) : (
            <div className="overflow-y-auto max-h-64">
              {normalizedEventTypes.map((value) => (
                <div
                  key={value}
                  className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0"
                >
                  <div className="text-sm font-medium text-gray-800">
                    {value}
                  </div>
                  <button
                    type="button"
                    className="flex items-center justify-center text-red-500 transition border border-red-200 rounded cursor-pointer h-7 w-7 hover:bg-red-50"
                    onClick={() => handleDeleteEventType(value)}
                    title="Удалить тип"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
