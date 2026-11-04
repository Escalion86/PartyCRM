'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import PartyInvitationContentEditor, {
  emptyInvitationContent,
} from '@components/party/invitations/PartyInvitationContentEditor'
import PartyInvitationPage from '@components/party/invitations/PartyInvitationPage'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
const empty = () => ({ title: '', content: emptyInvitationContent() })
export default function CompanySettingsInvitationsContent({ activeCompanyId }) {
  const [templates, setTemplates] = useState([])
  const [draft, setDraft] = useState(empty)
  const [saved, setSaved] = useState(() => JSON.stringify(empty()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const dirty = JSON.stringify(draft) !== saved
  usePartyUnsavedChanges(dirty, {
    label: 'шаблон приглашения',
    scope: activeCompanyId,
    pending: busy,
  })
  useEffect(() => {
    const controller = new AbortController()
    apiJson('/api/party/invitation-templates', {
      headers: { 'x-partycrm-company-id': activeCompanyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setTemplates(result.data)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [activeCompanyId, retry])
  const choose = (id) => {
    if (!requestPartyLeave({ kind: 'record', target: id || 'new-template' }))
      return
    const next = templates.find((item) => String(item._id) === id) || empty()
    setDraft(structuredClone(next))
    setSaved(JSON.stringify(next))
    setNotice('')
  }
  const save = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiJson('/api/party/invitation-templates', {
        method: draft._id ? 'PATCH' : 'POST',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify({
          id: draft._id,
          title: draft.title,
          content: draft.content,
          expectedRevision: draft.revision,
        }),
      })
      setDraft(result.data)
      setSaved(JSON.stringify(result.data))
      setTemplates((previous) =>
        draft._id
          ? previous.map((item) =>
              item._id === result.data._id ? result.data : item
            )
          : [...previous, result.data]
      )
      setNotice(
        'Шаблон сохранён. Его можно выбрать в типе заказа или в приглашении.'
      )
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-slate-600">
        Соберите страницу из заголовка, текстов, даты, места и оформления. В
        заказе шаблон можно дополнить перед публикацией.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <label className="block text-sm">
        Шаблон
        <select
          className={`${input} cursor-pointer`}
          value={draft._id || ''}
          disabled={busy}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="">Новый шаблон</option>
          {templates.map((item) => (
            <option key={String(item._id)} value={String(item._id)}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => setRetry((value) => value + 1)}
      >
        Обновить список шаблонов
      </button>
      <label className="block text-sm">
        Название шаблона
        <input
          className={input}
          value={draft.title}
          maxLength={180}
          disabled={busy}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </label>
      <PartyInvitationContentEditor
        value={draft.content}
        onChange={(content) => setDraft({ ...draft, content })}
        disabled={busy}
      />
      <button
        type="button"
        className={`${button} bg-sky-700 text-white`}
        disabled={busy || !dirty || !draft.title.trim()}
        onClick={save}
      >
        {busy ? 'Сохранение…' : 'Сохранить шаблон'}
      </button>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Предпросмотр оформления
        </summary>
        <p className="mb-3 text-xs text-slate-600">
          Дата, время и место будут подставлены из заказа при создании
          приглашения.
        </p>
        <PartyInvitationPage
          embedded
          invitation={{
            ...draft.content,
            companyTitle: '',
            eventDate: null,
            timeZone: 'Asia/Krasnoyarsk',
          }}
        />
      </details>
    </div>
  )
}
