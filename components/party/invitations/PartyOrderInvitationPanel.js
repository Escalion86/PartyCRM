'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import PartyInvitationContentEditor from './PartyInvitationContentEditor'
import PartyInvitationPage from './PartyInvitationPage'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
export default function PartyOrderInvitationPanel({
  companyId,
  order,
  context,
  disabled,
  onDirtyChange,
}) {
  const [state, setState] = useState({
    loaded: false,
    invitation: null,
    templates: [],
  })
  const [draft, setDraft] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const dirty = Boolean(
    draft &&
    JSON.stringify(draft) !== JSON.stringify(state.invitation?.snapshot)
  )
  usePartyUnsavedChanges(dirty, {
    label: 'приглашение',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  const canEdit =
    canPartyAccess(context, { resource: 'orders.title', action: 'edit' }) &&
    !['canceled'].includes(order.status)
  useEffect(() => {
    const controller = new AbortController()
    const config = {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }
    Promise.all([
      apiJson(`/api/party/orders/${order._id}/invitation`, config),
      apiJson('/api/party/invitation-templates', config),
    ])
      .then(([invitation, templates]) => {
        if (!controller.signal.aborted) {
          setState({
            loaded: true,
            invitation: invitation.data,
            templates: templates.data,
          })
          setDraft(invitation.data?.snapshot || null)
          setTemplateId(invitation.data?.templateId || '')
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [companyId, order._id, retry])
  const save = async (action) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiJson(
        `/api/party/orders/${order._id}/invitation`,
        {
          method: 'PUT',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify({
            action,
            expectedRevision: state.invitation?.revision,
            templateId: templateId || null,
            ...(draft && action !== 'apply_template'
              ? { snapshot: draft }
              : {}),
          }),
        }
      )
      setState((previous) => ({ ...previous, invitation: result.data }))
      setDraft(result.data.snapshot)
      setTemplateId(result.data.templateId || '')
      setNotice(
        action === 'publish'
          ? 'Приглашение опубликовано. Ссылку можно переслать гостям.'
          : action === 'unpublish'
            ? 'Публичная ссылка отключена.'
            : 'Приглашение сохранено.'
      )
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        new URL(state.invitation.url, window.location.origin).href
      )
      setNotice('Ссылка скопирована.')
    } catch {
      setNotice('Выделите ссылку ниже и скопируйте её вручную.')
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Пригласительное для гостей</h2>
      {error ? (
        <div role="alert" className="space-y-2 text-sm text-red-800">
          <p>{error}</p>
          <button
            type="button"
            className={button}
            disabled={busy || dirty}
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-sky-900">
          {notice}
        </p>
      ) : null}
      {!state.loaded && !error ? (
        <p role="status">Загрузка приглашения…</p>
      ) : null}
      {state.loaded ? (
        <>
          {canEdit ? (
            <div className="flex flex-col items-end gap-2 sm:flex-row">
              <label className="w-full text-sm">
                Шаблон
                <select
                  className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={templateId}
                  disabled={busy || disabled}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  <option value="">
                    Шаблон типа заказа или базовое оформление
                  </option>
                  {state.templates.map((item) => (
                    <option value={String(item._id)} key={String(item._id)}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`${button} shrink-0`}
                disabled={busy || disabled || dirty}
                onClick={() =>
                  save(state.invitation ? 'apply_template' : 'save')
                }
              >
                {state.invitation ? 'Применить шаблон' : 'Создать приглашение'}
              </button>
            </div>
          ) : null}
          {state.invitation && draft ? (
            <>
              {canEdit ? (
                <PartyInvitationContentEditor
                  value={draft}
                  onChange={setDraft}
                  disabled={busy || disabled}
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className={button}
                      disabled={busy || disabled || !dirty}
                      onClick={() => save('save')}
                    >
                      Сохранить приглашение
                    </button>
                    {!state.invitation.published ? (
                      <button
                        type="button"
                        className={`${button} bg-sky-700 text-white`}
                        disabled={busy || disabled}
                        onClick={() => save('publish')}
                      >
                        Опубликовать
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={button}
                        disabled={busy || disabled}
                        onClick={() => save('unpublish')}
                      >
                        Отключить ссылку
                      </button>
                    )}
                  </>
                ) : null}
                {state.invitation.published ? (
                  <button type="button" className={button} onClick={copy}>
                    Копировать ссылку
                  </button>
                ) : null}
              </div>
              {state.invitation.url ? (
                <label className="block text-sm">
                  Публичная ссылка
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    readOnly
                    value={
                      typeof window !== 'undefined'
                        ? new URL(state.invitation.url, window.location.origin)
                            .href
                        : state.invitation.url
                    }
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              ) : null}
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                  Предпросмотр приглашения
                </summary>
                <PartyInvitationPage
                  embedded
                  invitation={{ ...state.invitation.preview, ...draft }}
                />
              </details>
            </>
          ) : !canEdit ? (
            <p className="text-sm text-slate-600">
              Приглашение пока не создано.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
