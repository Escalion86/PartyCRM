'use client'

import { useState } from 'react'
import Button from '@components/Button'
import ContentHeader from '@components/ContentHeader'
import HeaderActions from '@components/HeaderActions'
import IconCheckBox from '@components/IconCheckBox'
import SectionCard from '@components/SectionCard'
import Input from '@components/Input'
import { useAtom } from 'jotai'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { postData } from '@helpers/CRUD'

const DevContent = () => {
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const forceFullSync = true
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupError, setCleanupError] = useState('')
  const [cleanupResult, setCleanupResult] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportResult, setExportResult] = useState(null)
  const [exportCopied, setExportCopied] = useState(false)
  const [convertLoading, setConvertLoading] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [convertResult, setConvertResult] = useState(null)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generateResult, setGenerateResult] = useState(null)
  const [generateCounts, setGenerateCounts] = useState({
    clients: 5,
    services: 3,
    requests: 5,
    events: 5,
    transactions: 10,
  })

  const handleSync = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/events/google-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceFullSync,
          storeCalendarResponse: Boolean(siteSettings?.storeCalendarResponse),
        }),
      })
      const rawText = await response.text()
      const data = rawText ? JSON.parse(rawText) : null
      if (!data) throw new Error('Пустой ответ от сервера')
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Не удалось синхронизировать календарь')
      setResult(data.data)
    } catch (syncError) {
      setError(syncError.message || 'Не удалось синхронизировать календарь')
    } finally {
      setLoading(false)
    }
  }

  const handleCleanup = async () => {
    if (
      !window.confirm(
        'Удалить все импортированные из календаря мероприятия, которые еще не проверены?'
      )
    )
      return

    setCleanupLoading(true)
    setCleanupError('')
    setCleanupResult(null)
    try {
      const response = await fetch('/api/events/cleanup-unchecked', { method: 'POST' })
      const rawText = await response.text()
      const data = rawText ? JSON.parse(rawText) : null
      if (!data) throw new Error('Пустой ответ от сервера')
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Не удалось удалить мероприятия')
      setCleanupResult(data.data)
    } catch (cleanupErr) {
      setCleanupError(cleanupErr.message || 'Не удалось удалить мероприятия')
    } finally {
      setCleanupLoading(false)
    }
  }

  const handleExport = async () => {
    setExportLoading(true)
    setExportError('')
    setExportResult(null)
    setExportCopied(false)
    try {
      const response = await fetch('/api/events/google-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const rawText = await response.text()
      const data = rawText ? JSON.parse(rawText) : null
      if (!data) throw new Error('Пустой ответ от сервера')
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Не удалось получить данные календаря')
      setExportResult(data.data)
      if (navigator?.clipboard && data.data?.text) {
        await navigator.clipboard.writeText(data.data.text)
        setExportCopied(true)
      }
    } catch (exportErr) {
      setExportError(exportErr.message || 'Не удалось получить данные календаря')
    } finally {
      setExportLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerateLoading(true)
    setGenerateError('')
    setGenerateResult(null)
    try {
      const response = await fetch('/api/dev/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateCounts),
      })
      const rawText = await response.text()
      const data = rawText ? JSON.parse(rawText) : null
      if (!data) throw new Error('Пустой ответ от сервера')
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Не удалось сгенерировать данные')
      setGenerateResult(data.data)
    } catch (genError) {
      setGenerateError(genError.message || 'Не удалось сгенерировать данные')
    } finally {
      setGenerateLoading(false)
    }
  }

  const handleConvertRequests = async () => {
    if (
      !window.confirm(
        'Преобразовать все заявки (requests) в мероприятия со статусом "draft"?'
      )
    )
      return

    setConvertLoading(true)
    setConvertError('')
    setConvertResult(null)
    try {
      const response = await fetch('/api/dev/requests-to-events', {
        method: 'POST',
      })
      const rawText = await response.text()
      const data = rawText ? JSON.parse(rawText) : null
      if (!data) throw new Error('Пустой ответ от сервера')
      if (!response.ok || !data.success)
        throw new Error(data.error || 'Не удалось преобразовать заявки')
      setConvertResult(data.data)
    } catch (convertErr) {
      setConvertError(convertErr.message || 'Не удалось преобразовать заявки')
    } finally {
      setConvertLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <ContentHeader>
        <HeaderActions
          left={<h2 className="text-xl font-semibold">Разработчик</h2>}
          right={<div />}
        />
      </ContentHeader>
      <SectionCard className="flex flex-1 min-h-0 flex-col gap-4 overflow-auto p-4">
        <IconCheckBox
          label="Сохранять ответ Google Calendar в поле мероприятия"
          checked={Boolean(siteSettings?.storeCalendarResponse)}
          onClick={() =>
            postData(
              '/api/site',
              { storeCalendarResponse: !siteSettings?.storeCalendarResponse },
              (data) => setSiteSettings(data),
              null,
              false,
              null
            )
          }
          noMargin
        />
        <div className="flex flex-col gap-3">
          <Button
            name="Синхронизировать календарь"
            onClick={handleSync}
            loading={loading}
            className="w-full sm:w-auto"
          />
        </div>
        <div className="flex flex-col gap-3 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-amber-800">
            Удалить все мероприятия, импортированные из Google Calendar, которые еще не
            отмечены как проверенные.
          </div>
          <div className="text-xs text-amber-700">
            Удаление касается только данных в CRM и не затрагивает Google Calendar.
          </div>
          <Button
            name="Удалить непроверенные импорты"
            onClick={handleCleanup}
            loading={cleanupLoading}
            className="w-full sm:w-auto bg-amber-600 text-white hover:bg-amber-700"
          />
          {cleanupError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {cleanupError}
            </div>
          )}
          {cleanupResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Удалено мероприятий: <b>{cleanupResult.deleted ?? 0}</b>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded border border-sky-200 bg-sky-50 p-3">
          <div className="text-sm text-sky-800">
            Экспортировать данные мероприятий для проверки парсинга (без
            организаторов, участников и ссылок).
          </div>
          <Button
            name="Скопировать данные для проверки"
            onClick={handleExport}
            loading={exportLoading}
            className="w-full sm:w-auto bg-sky-600 text-white hover:bg-sky-700"
          />
          {exportError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {exportError}
            </div>
          )}
          {exportResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <div>
                Экспортировано событий: <b>{exportResult.count ?? 0}</b>
              </div>
              {exportResult.skipped ? (
                <div>
                  Пропущено (заявки в названии): <b>{exportResult.skipped}</b>
                </div>
              ) : null}
              {exportCopied && (
                <div className="mt-1 text-xs text-emerald-800">
                  Данные скопированы в буфер обмена.
                </div>
              )}
              {!exportCopied && exportResult.text && (
                <textarea
                  readOnly
                  className="mt-2 max-h-48 w-full resize-none rounded border border-emerald-200 bg-white p-2 text-xs text-emerald-900"
                  value={exportResult.text}
                />
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <div>
              Импортировано событий: <b>{result.imported ?? 0}</b>
            </div>
            {Array.isArray(result.results) && result.results.length > 0 && (
              <div className="mt-2 max-h-64 overflow-auto text-xs text-emerald-900">
                <ul className="list-disc space-y-1 pl-4">
                  {result.results.map((item) => (
                    <li key={item.googleId}>
                      {item.title || 'Без названия'} — {item.action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 rounded border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm text-slate-800 font-semibold">
            Генерация тестовых данных
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Клиенты"
              type="number"
              min={0}
              max={200}
              value={generateCounts.clients}
              onChange={(value) =>
                setGenerateCounts((prev) => ({ ...prev, clients: value }))
              }
              noMargin
            />
            <Input
              label="Услуги"
              type="number"
              min={0}
              max={200}
              value={generateCounts.services}
              onChange={(value) =>
                setGenerateCounts((prev) => ({ ...prev, services: value }))
              }
              noMargin
            />
            <Input
              label="Заявки"
              type="number"
              min={0}
              max={200}
              value={generateCounts.requests}
              onChange={(value) =>
                setGenerateCounts((prev) => ({ ...prev, requests: value }))
              }
              noMargin
            />
            <Input
              label="Мероприятия"
              type="number"
              min={0}
              max={200}
              value={generateCounts.events}
              onChange={(value) =>
                setGenerateCounts((prev) => ({ ...prev, events: value }))
              }
              noMargin
            />
            <Input
              label="Транзакции"
              type="number"
              min={0}
              max={500}
              value={generateCounts.transactions}
              onChange={(value) =>
                setGenerateCounts((prev) => ({ ...prev, transactions: value }))
              }
              noMargin
            />
          </div>
          <Button
            name="Сгенерировать"
            onClick={handleGenerate}
            loading={generateLoading}
            className="w-full sm:w-auto"
          />
          {generateError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {generateError}
            </div>
          )}
          {generateResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <div>Клиенты: <b>{generateResult.clients ?? 0}</b></div>
              <div>Услуги: <b>{generateResult.services ?? 0}</b></div>
              <div>Заявки: <b>{generateResult.requests ?? 0}</b></div>
              <div>Мероприятия: <b>{generateResult.events ?? 0}</b></div>
              <div>Транзакции: <b>{generateResult.transactions ?? 0}</b></div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded border border-violet-200 bg-violet-50 p-3">
          <div className="text-sm text-violet-800">
            Преобразовать все заявки из коллекции requests в мероприятия со статусом &quot;draft&quot;.
          </div>
          <Button
            name="Преобразовать заявки в мероприятия"
            onClick={handleConvertRequests}
            loading={convertLoading}
            className="w-full sm:w-auto bg-violet-600 text-white hover:bg-violet-700"
          />
          {convertError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {convertError}
            </div>
          )}
          {convertResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <div>
                Преобразовано: <b>{convertResult.converted ?? 0}</b>
              </div>
              <div>
                Пропущено: <b>{convertResult.skipped ?? 0}</b>
              </div>
              <div>
                Удалено заявок: <b>{convertResult.deleted ?? 0}</b>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

export default DevContent
