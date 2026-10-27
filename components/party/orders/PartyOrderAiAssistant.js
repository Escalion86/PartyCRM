'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { applyPartyAiPatch, PARTY_AI_FIELDS } from '@helpers/partyOrderAi.mjs'

const buttonClass =
  'min-h-10 cursor-pointer rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50'

export default function PartyOrderAiAssistant({
  draft,
  onApply,
  companyId,
  clients,
  locations,
  services,
  disabled,
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState(null)
  const recorder = useRef(null)
  const stream = useRef(null)
  const controller = useRef(null)
  const timer = useRef(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  const headers = { 'x-partycrm-company-id': companyId }
  const prepare = async () => {
    if (controller.current || disabled) return
    controller.current = new AbortController()
    setBusy(true)
    setError('')
    setProposal(null)
    const snapshot = JSON.stringify(draft)
    try {
      const response = await apiJson('/api/party/orders/ai-assist', {
        method: 'POST',
        headers,
        signal: controller.current.signal,
        body: JSON.stringify({ text, orderId: draft._id, draft }),
      })
      if (mounted.current) setProposal({ ...response.data, snapshot })
    } catch (err) {
      if (mounted.current && err.name !== 'AbortError') setError(err.message)
    } finally {
      controller.current = null
      if (mounted.current) setBusy(false)
    }
  }
  const transcribe = async (blob) => {
    if (!mounted.current) return
    setRecording(false)
    if (!blob.size || blob.size > 10 * 1024 * 1024) {
      setError('Запись пуста или превышает 10 МБ')
      return
    }
    controller.current = new AbortController()
    setBusy(true)
    try {
      const form = new FormData()
      form.set(
        'audio',
        blob,
        blob.name ||
          (blob.type.includes('mp4') ? 'recording.m4a' : 'recording.webm')
      )
      const response = await fetch('/api/party/orders/ai-assist', {
        method: 'POST',
        headers,
        body: form,
        signal: controller.current.signal,
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result?.error?.message || 'Не удалось распознать запись'
        )
      if (mounted.current) {
        setText((old) =>
          [old, result.data.text].filter(Boolean).join('\n').slice(0, 12000)
        )
        setProposal(null)
      }
    } catch (err) {
      if (mounted.current && err.name !== 'AbortError') setError(err.message)
    } finally {
      controller.current = null
      if (mounted.current) setBusy(false)
    }
  }
  const record = async () => {
    if (busy || recording || disabled) return
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        'Запись недоступна в этом браузере. Введите текст или выберите аудиофайл.'
      )
      return
    }
    setBusy(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const instance = new MediaRecorder(media)
      recorder.current = instance
      const chunks = []
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      instance.onstop = () => {
        clearTimeout(timer.current)
        media.getTracks().forEach((track) => track.stop())
        transcribe(
          new Blob(chunks, { type: instance.mimeType || 'audio/webm' })
        )
      }
      instance.start()
      setRecording(true)
      timer.current = setTimeout(() => {
        if (instance.state === 'recording') instance.stop()
      }, 120000)
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop())
      setError('Нет доступа к микрофону. Разрешите запись или введите текст.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const display = (key, value) => {
    if (value === undefined || value === null || value === '')
      return 'Не указано'
    if (key === 'eventDate') return new Date(value).toLocaleString('ru-RU')
    if (key === 'clientId') {
      const item = clients.find((item) => String(item._id) === String(value))
      return item
        ? [item.firstName, item.secondName].filter(Boolean).join(' ') ||
            item.phone
        : 'Клиент не найден'
    }
    if (key === 'locationId')
      return (
        locations.find((item) => String(item._id) === String(value))?.title ||
        'Площадка не найдена'
      )
    if (key === 'servicesIds')
      return value
        .map(
          (id) =>
            services.find((item) => String(item._id) === String(id))?.title ||
            'Услуга'
        )
        .join(', ')
    return String(value)
  }
  const changes = Object.entries(proposal?.patch || {}).filter(
    ([key, value]) => JSON.stringify(draft[key]) !== JSON.stringify(value)
  )
  return (
    <details className="mx-auto mb-4 w-full max-w-3xl rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-violet-900">
        {draft._id ? 'Изменить заказ с ИИ' : 'Заполнить заказ с ИИ'} · текстом
        или голосом
      </summary>
      <p className="my-2 text-sm text-slate-600">
        Опишите договорённости. Проверьте изменения, затем сохраните заказ.
        Запросы оплачиваются через подключение ИИ вашей компании.
      </p>
      <label className="block text-sm font-semibold">
        Текст или расшифровка
        <textarea
          value={text}
          maxLength={12000}
          rows={4}
          disabled={busy || recording || disabled}
          onChange={(event) => {
            setText(event.target.value)
            setProposal(null)
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={busy || disabled}
          onClick={() => (recording ? recorder.current?.stop() : record())}
        >
          {recording ? 'Остановить запись' : 'Записать голос'}
        </button>
        <label
          className={`${buttonClass} ${busy || recording || disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          Аудиофайл
          <input
            aria-label="Выбрать аудиофайл"
            type="file"
            accept="audio/*"
            className="sr-only"
            disabled={busy || recording || disabled}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) transcribe(file)
              event.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || recording || disabled || !text.trim()}
          onClick={prepare}
        >
          {busy ? 'Обрабатываем…' : 'Предложить изменения · ИИ'}
        </button>
      </div>
      {recording && (
        <p role="status" className="mt-2 text-sm">
          Идёт запись, максимум 2 минуты
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {proposal && (
        <div className="mt-3 grid gap-2">
          {proposal.notes.map((note, index) => (
            <p key={index} className="text-sm text-slate-700">
              {note}
            </p>
          ))}
          {changes.map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg bg-white p-3 text-sm break-words"
            >
              <strong>{PARTY_AI_FIELDS[key]}</strong>
              <div className="text-slate-500">
                Было: {display(key, draft[key])}
              </div>
              <div>Станет: {display(key, value)}</div>
            </div>
          ))}
          {!changes.length ? (
            <p className="text-sm">
              Нет изменений. Дополните запрос или заполните поля вручную.
            </p>
          ) : (
            <button
              type="button"
              className={buttonClass}
              disabled={disabled || busy}
              onClick={() => {
                if (JSON.stringify(draft) !== proposal.snapshot) {
                  setError(
                    'Заказ изменился после анализа. Повторите подготовку изменений.'
                  )
                  setProposal(null)
                  return
                }
                onApply(applyPartyAiPatch(draft, proposal.patch))
                setProposal(null)
              }}
            >
              Перенести в форму — без сохранения
            </button>
          )}
        </div>
      )}
    </details>
  )
}
