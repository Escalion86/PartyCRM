'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import CompanySettingsBriefContent from './CompanySettingsBriefContent'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
export default function CompanySettingsOrderTypesContent({ activeCompanyId }) {
  const [types, setTypes] = useState([])
  const [templates, setTemplates] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState('')
  const [rename, setRename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [retry, setRetry] = useState(0)
  const selected = types.find((item) => String(item._id) === selectedId)
  usePartyUnsavedChanges(
    Boolean(title || (selected && rename !== selected.title)),
    { label: 'тип заказа', scope: activeCompanyId, pending: busy }
  )
  useEffect(() => {
    const controller = new AbortController()
    const config = {
      headers: { 'x-partycrm-company-id': activeCompanyId },
      cache: 'no-store',
      signal: controller.signal,
    }
    Promise.all([
      apiJson('/api/party/order-types?all=true', config),
      apiJson('/api/party/invitation-templates', config),
    ])
      .then(([result, invitations]) => {
        if (!controller.signal.aborted) {
          setTypes(result.data)
          setTemplates(invitations.data)
          setLoaded(true)
          setError('')
          setSelectedId('')
          setRename('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [activeCompanyId, retry])
  const save = async (patch) => {
    setBusy(true)
    setError('')
    try {
      const result = await apiJson('/api/party/order-types', {
        method: patch ? 'PATCH' : 'POST',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify(
          patch
            ? { id: selectedId, expectedRevision: selected.revision, ...patch }
            : { title }
        ),
      })
      setTypes((previous) =>
        patch
          ? previous.map((item) =>
              item._id === result.data._id ? result.data : item
            )
          : [...previous, result.data]
      )
      setTitle('')
      setSelectedId(String(result.data._id))
      setRename(result.data.title)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-slate-600">
        Тип определяет заголовок заказа, доступные услуги и форму брифа.
        Архивный тип сохраняется в прежних заказах.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col items-end gap-2 sm:flex-row">
        <label className="w-full text-sm">
          Новый тип заказа
          <input
            className={input}
            value={title}
            maxLength={180}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, День рождения"
          />
        </label>
        <button
          className={`${button} shrink-0`}
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => save()}
        >
          Добавить тип
        </button>
      </div>
      <label className="block text-sm">
        Настроить тип
        <select
          className={`${input} cursor-pointer`}
          disabled={busy || !loaded}
          value={selectedId}
          onChange={(event) => {
            if (
              !requestPartyLeave({ kind: 'record', target: event.target.value })
            )
              return
            const next = types.find(
              (item) => String(item._id) === event.target.value
            )
            setSelectedId(event.target.value)
            setRename(next?.title || '')
          }}
        >
          <option value="">
            {loaded ? 'Выберите тип' : 'Загрузка типов…'}
          </option>
          {types.map((item) => (
            <option key={String(item._id)} value={String(item._id)}>
              {item.title}
              {item.active ? '' : ' · архив'}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => {
          if (requestPartyLeave({ kind: 'record', target: 'reload-types' }))
            setRetry((value) => value + 1)
        }}
      >
        Обновить список
      </button>
      {selected ? (
        <div className="space-y-5 border-t border-slate-200 pt-5">
          <div className="flex flex-col items-end gap-2 sm:flex-row">
            <label className="w-full text-sm">
              Название типа
              <input
                className={input}
                value={rename}
                maxLength={180}
                disabled={busy}
                onChange={(event) => setRename(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={`${button} shrink-0`}
              disabled={busy || !rename.trim() || rename === selected.title}
              onClick={() => save({ title: rename })}
            >
              Сохранить название
            </button>
            <button
              type="button"
              className={`${button} shrink-0`}
              disabled={busy}
              onClick={() => save({ active: !selected.active })}
            >
              {selected.active ? 'В архив' : 'Восстановить'}
            </button>
          </div>
          <label className="block text-sm">
            Шаблон пригласительного по умолчанию
            <select
              className={`${input} cursor-pointer`}
              disabled={busy}
              value={selected.invitationTemplateId || ''}
              onChange={(event) =>
                save({ invitationTemplateId: event.target.value || null })
              }
            >
              <option value="">Без шаблона по умолчанию</option>
              {templates.map((item) => (
                <option key={String(item._id)} value={String(item._id)}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <h2 className="text-lg font-semibold">Бриф «{selected.title}»</h2>
          <CompanySettingsBriefContent
            key={selectedId}
            activeCompanyId={activeCompanyId}
            orderTypeId={selectedId}
          />
        </div>
      ) : null}
    </div>
  )
}
