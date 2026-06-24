'use client'

import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import {
  buildPartyAvitoWebhookUrl,
  buildPartyNovofonWebhookUrl,
  buildPartyVkWebhookUrl,
} from '@helpers/partyIntegrationWebhooks'
import PartyGoogleCalendarSettings from '@components/party/settings/PartyGoogleCalendarSettings'
import { isGoogleCalendarLocked } from '@components/party/settings/PartyGoogleCalendarSettingsState'
import useCompanySettings from '../useCompanySettings'
import { getCompanyIntegrationIndicatorState } from './companyIntegrationState'

const createSecret = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}`
}

const buildOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin.replace(/\/+$/, '')

const INTEGRATION_INDICATOR_VIEW = {
  connected: {
    className: 'bg-emerald-500 ring-4 ring-emerald-100',
    label: 'Интеграция подключена',
  },
  disconnected: {
    className: 'bg-slate-300 ring-4 ring-slate-100',
    label: 'Интеграция не подключена',
  },
  warning: {
    className: 'bg-amber-400 ring-4 ring-amber-100',
    label: 'Интеграция требует внимания',
  },
  loading: {
    className: 'animate-pulse bg-slate-300 ring-4 ring-slate-100',
    label: 'Проверяем состояние интеграции',
  },
}

const CompanyIntegrationCard = ({
  title,
  description,
  children,
  note = '',
  locked = false,
  indicatorState = 'disconnected',
}) => {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const indicator =
    INTEGRATION_INDICATOR_VIEW[indicatorState] ||
    INTEGRATION_INDICATOR_VIEW.disconnected

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        locked ? 'border-amber-200 bg-amber-50' : 'border-sky-100 bg-white'
      }`}
    >
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-20 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-sky-50/70"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicator.className}`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-900">
              {title}
            </span>
            <span className="mt-1 block text-sm leading-5 text-slate-500">
              {description}
            </span>
            <span className="sr-only">{indicator.label}</span>
          </span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-4 w-4 shrink-0 text-sky-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? (
        <div id={contentId} className="border-t border-sky-100 px-5 py-4">
          {locked ? (
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
              Недоступно на текущем тарифе компании.
            </div>
          ) : null}
          {note ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {note}
            </div>
          ) : null}
          <div
            className={
              locked
                ? 'pointer-events-none mt-4 grid gap-3 opacity-50'
                : 'grid gap-3'
            }
          >
            {children}
          </div>
        </div>
      ) : null}
    </section>
  )
}

const Field = ({
  label,
  value,
  type = 'text',
  readOnly = false,
  placeholder = '',
  onChange,
}) => (
  <label className="grid gap-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </span>
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
      className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
    />
  </label>
)

const IntegrationActions = ({
  provider,
  webhookUrl = '',
  disabled = false,
  loading = false,
  onConnect,
  onCheck,
  onDisconnect,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {onConnect ? (
      <button
        type="button"
        onClick={onConnect}
        disabled={disabled || loading}
        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Подключить
      </button>
    ) : null}
    {onCheck ? (
      <button
        type="button"
        onClick={onCheck}
        disabled={disabled || loading}
        className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        Проверить
      </button>
    ) : null}
    {webhookUrl ? (
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(webhookUrl)}
        disabled={disabled || loading}
        className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        Скопировать webhook
      </button>
    ) : null}
    {onDisconnect ? (
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disabled || loading}
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        Отключить
      </button>
    ) : null}
    {loading ? (
      <span className="text-xs text-slate-500">
        Выполняем действие {provider}...
      </span>
    ) : null}
  </div>
)

const IntegrationDiagnostics = ({ state }) => (
  <div className="grid gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
    <div>Статус: {state?.status || 'not_connected'}</div>
    <div>Последняя проверка: {state?.lastCheckedAt || 'нет данных'}</div>
    <div>Последнее событие: {state?.lastWebhookAt || 'нет данных'}</div>
    {state?.lastError ? (
      <div className="text-red-600">Последняя ошибка: {state.lastError}</div>
    ) : null}
  </div>
)

export default function CompanySettingsIntegrationsContent({ activeCompanyId }) {
  const { settings, access, loading, saving, error, reload, savePatch } =
    useCompanySettings(activeCompanyId)
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [statusLoading, setStatusLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [actionError, setActionError] = useState('')
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState(null)
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(true)
  const [googleCalendarError, setGoogleCalendarError] = useState('')
  const [googleCalendarOauthNotice, setGoogleCalendarOauthNotice] =
    useState(null)
  const [googleCalendarDraftSyncVersion, setGoogleCalendarDraftSyncVersion] =
    useState(0)
  const activeCompanyIdRef = useRef(activeCompanyId)
  const googleCalendarRequestIdRef = useRef(0)
  activeCompanyIdRef.current = activeCompanyId

  const reloadStatus = useCallback(() => {
    if (!activeCompanyId) return Promise.resolve()
    setStatusLoading(true)
    return apiJson('/api/party/integrations/status', {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': activeCompanyId },
    })
      .then((response) => {
        setStatus(response.data ?? {})
        setStatusError('')
      })
      .catch((loadError) => {
        setStatusError(
          loadError.message || 'Не удалось загрузить состояние интеграций'
        )
      })
      .finally(() => setStatusLoading(false))
  }, [activeCompanyId])

  useEffect(() => {
    if (!activeCompanyId) return
    reloadStatus()
  }, [activeCompanyId, reloadStatus, settings?.integrations])

  const reloadGoogleCalendarStatus = useCallback(({ syncDraft = false } = {}) => {
    if (!activeCompanyId) return Promise.resolve()
    const requestedCompanyId = activeCompanyId
    const requestId = googleCalendarRequestIdRef.current + 1
    googleCalendarRequestIdRef.current = requestId
    setGoogleCalendarLoading(true)
    return apiJson('/api/party/google-calendar/status', {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': activeCompanyId },
      })
      .then((response) => {
        if (
          activeCompanyIdRef.current !== requestedCompanyId ||
          googleCalendarRequestIdRef.current !== requestId
        ) {
          return
        }
        setGoogleCalendarStatus(response.data ?? null)
        setGoogleCalendarError('')
        if (syncDraft) setGoogleCalendarDraftSyncVersion((value) => value + 1)
      })
      .catch((loadError) => {
        if (
          activeCompanyIdRef.current !== requestedCompanyId ||
          googleCalendarRequestIdRef.current !== requestId
        ) {
          return
        }
        setGoogleCalendarStatus(null)
        setGoogleCalendarError(
          loadError.message || 'Не удалось загрузить состояние Google Calendar'
        )
      })
      .finally(() => {
        if (
          activeCompanyIdRef.current === requestedCompanyId &&
          googleCalendarRequestIdRef.current === requestId
        ) {
          setGoogleCalendarLoading(false)
        }
      })
  }, [activeCompanyId])

  useEffect(() => {
    setGoogleCalendarStatus(null)
    setGoogleCalendarError('')
    setGoogleCalendarLoading(true)
    setGoogleCalendarOauthNotice(null)
    reloadGoogleCalendarStatus({ syncDraft: true })
  }, [reloadGoogleCalendarStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthStatus = params.get('googleCalendar')
    if (!oauthStatus) return

    setGoogleCalendarOauthNotice({
      success: oauthStatus === 'connected',
      error: params.get('error') || 'oauth_failed',
    })
    params.delete('googleCalendar')
    params.delete('error')
    const query = params.toString()
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    )
    reloadGoogleCalendarStatus({ syncDraft: true })
  }, [reloadGoogleCalendarStatus])

  const integrations = settings?.integrations ?? {}
  const origin = buildOrigin()
  const telephonyLocked = Boolean(access && !access.allowTelephony)
  const aiLocked = Boolean(access && !access.allowAi)
  const googleCalendarLocked = isGoogleCalendarLocked({
    access,
    status: googleCalendarStatus,
  })

  const googleCalendarIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'googleCalendar',
    connected: googleCalendarStatus?.connected === true,
    calendarId: googleCalendarStatus?.calendarId,
    enabled: googleCalendarStatus?.enabled === true,
    lastError: googleCalendarStatus?.diagnostics?.lastSyncError,
    reconnectRequired:
      googleCalendarStatus?.diagnostics?.lastSyncError === 'reconnect_required',
    locked: googleCalendarLocked,
    loading: googleCalendarLoading,
  })

  const publicLeadIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'publicLead',
    enabled: settings?.publicLeadEnabled === true,
    apiKeys: settings?.publicLeadApiKeys ?? [],
  })
  const avitoIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'avito',
    enabled: status?.avito?.enabled ?? integrations.avitoEnabled === true,
    status: status?.avito?.status,
    loading: statusLoading,
  })
  const vkIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'vk',
    enabled: status?.vk?.enabled ?? integrations.vkGroupEnabled === true,
    status: status?.vk?.status,
    loading: statusLoading,
  })
  const novofonIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'novofon',
    enabled:
      status?.novofon?.enabled ?? integrations.novofonEnabled === true,
    apiKey: status?.novofon?.apiKey ?? integrations.novofonApiKey,
    locked: telephonyLocked,
    loading: statusLoading,
  })
  const aiIndicatorState = getCompanyIntegrationIndicatorState({
    type: 'ai',
    apiKey: status?.ai?.aitunnelKey ?? integrations.aitunnelKey,
    locked: aiLocked,
    loading: statusLoading,
  })

  const avitoWebhookUrl = useMemo(() => {
    const token = integrations.avitoWebhookToken || ''
    return token ? buildPartyAvitoWebhookUrl({ origin, token }) : ''
  }, [integrations.avitoWebhookToken, origin])

  const vkWebhookUrl = useMemo(() => {
    const token = integrations.vkGroupWebhookToken || ''
    return token ? buildPartyVkWebhookUrl({ origin, token }) : ''
  }, [integrations.vkGroupWebhookToken, origin])

  const novofonWebhookUrl = useMemo(() => {
    const secret = integrations.novofonWebhookSecret || ''
    return secret ? buildPartyNovofonWebhookUrl({ origin, token: secret }) : ''
  }, [integrations.novofonWebhookSecret, origin])

  const patchIntegrations = (patch) =>
    savePatch({
      integrations: {
        ...integrations,
        ...patch,
      },
    })

  const patchSettings = (patch) => savePatch(patch)

  const createPublicLeadApiKey = () => {
    const name = window.prompt('Название ключа', 'Tilda')
    const trimmedName = name?.trim()
    if (!trimmedName) return
    const nextKey = {
      id: createSecret('lead').slice(0, 80),
      name: trimmedName,
      key: createSecret('party_lead'),
      enabled: true,
    }
    patchSettings({
      publicLeadApiKeys: [...(settings?.publicLeadApiKeys ?? []), nextKey],
    })
  }

  const updatePublicLeadApiKey = (id, patch) => {
    patchSettings({
      publicLeadApiKeys: (settings?.publicLeadApiKeys ?? []).map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    })
  }

  const deletePublicLeadApiKey = (id) => {
    patchSettings({
      publicLeadApiKeys: (settings?.publicLeadApiKeys ?? []).filter(
        (item) => item.id !== id
      ),
    })
  }

  const runIntegrationAction = async ({
    provider,
    action,
    method = 'POST',
    body = null,
  }) => {
    setActionLoading(`${provider}:${action}`)
    setActionError('')
    try {
      await apiJson(`/api/party/integrations/${provider}/${action}`, {
        method,
        headers: { 'x-partycrm-company-id': activeCompanyId },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      await reload()
      await reloadStatus()
    } catch (actionLoadError) {
      setActionError(
        actionLoadError.message || 'Не удалось выполнить действие интеграции'
      )
    } finally {
      setActionLoading('')
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки интеграций...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {statusError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {statusError}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {actionError}
        </div>
      ) : null}
      {googleCalendarError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {googleCalendarError}
        </div>
      ) : null}

      <CompanyIntegrationCard
        title="Google Calendar"
        description="Односторонняя синхронизация заказов компании и напоминаний с выбранным календарём."
        indicatorState={googleCalendarIndicatorState}
        locked={googleCalendarLocked}
      >
        <PartyGoogleCalendarSettings
          activeCompanyId={activeCompanyId}
          companyTimeZone={settings?.timeZone}
          locked={googleCalendarLocked}
          status={googleCalendarStatus}
          statusLoading={googleCalendarLoading}
          reloadStatus={reloadGoogleCalendarStatus}
          oauthNotice={googleCalendarOauthNotice}
          draftSyncVersion={googleCalendarDraftSyncVersion}
        />
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="Входящие заявки API / Tilda"
        description="Публичные endpoints PartyCRM для заявок с сайта, Tilda и внешних форм."
        indicatorState={publicLeadIndicatorState}
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={settings?.publicLeadEnabled === true}
            onChange={(event) =>
              patchSettings({ publicLeadEnabled: event.target.checked })
            }
          />
          Принимать заявки по API
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Public lead URL"
            value={`${origin}/api/party/public/lead`}
            readOnly
          />
          <Field
            label="Tilda URL"
            value={`${origin}/api/party/public/lead/tilda`}
            readOnly
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={createPublicLeadApiKey}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700"
          >
            Создать API key
          </button>
        </div>
        <div className="grid gap-2">
          {(settings?.publicLeadApiKeys ?? []).length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500">
              Ключей пока нет
            </div>
          ) : (
            (settings?.publicLeadApiKeys ?? []).map((item) => (
              <div
                key={item.id || item.key}
                className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
              >
                <div className="grid gap-2 lg:grid-cols-[1fr_2fr_auto]">
                  <input
                    type="text"
                    value={item.name || ''}
                    onChange={(event) =>
                      updatePublicLeadApiKey(item.id, {
                        name: event.target.value,
                      })
                    }
                    className="h-10 rounded-lg border border-sky-100 px-3 text-sm"
                  />
                  <input
                    type="text"
                    value={item.key || ''}
                    readOnly
                    className="h-10 rounded-lg border border-sky-100 px-3 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(item.key)}
                      className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700"
                    >
                      Копировать
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePublicLeadApiKey(item.id, {
                          enabled: item.enabled === false,
                        })
                      }
                      className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700"
                    >
                      {item.enabled === false ? 'Включить' : 'Отключить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePublicLeadApiKey(item.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="Avito"
        description="Поля подключения и webhook компании для Avito."
        indicatorState={avitoIndicatorState}
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={integrations.avitoEnabled === true}
            onChange={(event) =>
              patchIntegrations({
                avitoEnabled: event.target.checked,
                avitoWebhookToken:
                  integrations.avitoWebhookToken || createSecret('avito'),
              })
            }
          />
          Интеграция включена
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Client ID"
            value={integrations.avitoClientId || ''}
            onChange={(value) => patchIntegrations({ avitoClientId: value })}
          />
          <Field
            label="User ID"
            value={integrations.avitoUserId || ''}
            onChange={(value) => patchIntegrations({ avitoUserId: value })}
          />
        </div>
        <Field
          label="Client Secret"
          type="password"
          value={integrations.avitoClientSecret || ''}
          onChange={(value) => patchIntegrations({ avitoClientSecret: value })}
        />
        <Field label="Webhook URL" value={avitoWebhookUrl} readOnly />
        {statusLoading ? (
          <div className="text-xs text-slate-500">Проверяем статус...</div>
        ) : (
          <IntegrationDiagnostics state={status?.avito} />
        )}
        <IntegrationActions
          provider="Avito"
          webhookUrl={avitoWebhookUrl}
          loading={actionLoading.startsWith('avito:')}
          onConnect={() =>
            runIntegrationAction({
              provider: 'avito',
              action: 'connect',
              body: {
                clientId: integrations.avitoClientId,
                clientSecret: integrations.avitoClientSecret,
                userId: integrations.avitoUserId,
              },
            })
          }
          onCheck={() =>
            runIntegrationAction({
              provider: 'avito',
              action: 'check',
              method: 'GET',
            })
          }
          onDisconnect={() =>
            runIntegrationAction({ provider: 'avito', action: 'disconnect' })
          }
        />
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="VK"
        description="Настройки группы VK и Callback API на уровне компании."
        indicatorState={vkIndicatorState}
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={integrations.vkGroupEnabled === true}
            onChange={(event) =>
              patchIntegrations({
                vkGroupEnabled: event.target.checked,
                vkGroupWebhookToken:
                  integrations.vkGroupWebhookToken || createSecret('vk'),
                vkGroupWebhookSecret:
                  integrations.vkGroupWebhookSecret || createSecret('vksec'),
              })
            }
          />
          Интеграция включена
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Group ID"
            value={integrations.vkGroupId || ''}
            onChange={(value) => patchIntegrations({ vkGroupId: value })}
          />
          <Field
            label="Confirmation Code"
            value={integrations.vkGroupConfirmationCode || ''}
            onChange={(value) =>
              patchIntegrations({ vkGroupConfirmationCode: value })
            }
          />
        </div>
        <Field
          label="Access Token"
          type="password"
          value={integrations.vkGroupAccessToken || ''}
          onChange={(value) =>
            patchIntegrations({ vkGroupAccessToken: value })
          }
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Webhook URL" value={vkWebhookUrl} readOnly />
          <Field
            label="Secret Key"
            value={integrations.vkGroupWebhookSecret || ''}
            onChange={(value) =>
              patchIntegrations({ vkGroupWebhookSecret: value })
            }
          />
        </div>
        {statusLoading ? (
          <div className="text-xs text-slate-500">Проверяем статус...</div>
        ) : (
          <IntegrationDiagnostics state={status?.vk} />
        )}
        <IntegrationActions
          provider="VK"
          webhookUrl={vkWebhookUrl}
          loading={actionLoading.startsWith('vk:')}
          onConnect={() =>
            runIntegrationAction({
              provider: 'vk',
              action: 'connect',
              body: {
                groupId: integrations.vkGroupId,
                accessToken: integrations.vkGroupAccessToken,
                confirmationCode: integrations.vkGroupConfirmationCode,
              },
            })
          }
          onCheck={() =>
            runIntegrationAction({
              provider: 'vk',
              action: 'check',
              method: 'GET',
            })
          }
          onDisconnect={() =>
            runIntegrationAction({ provider: 'vk', action: 'disconnect' })
          }
        />
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="Novofon"
        description="Секрет webhook и ключ телефонии компании."
        locked={telephonyLocked}
        indicatorState={novofonIndicatorState}
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={integrations.novofonEnabled === true}
            onChange={(event) =>
              patchIntegrations({
                novofonEnabled: event.target.checked,
                novofonWebhookSecret:
                  integrations.novofonWebhookSecret ||
                  createSecret('novofon'),
              })
            }
          />
          Интеграция включена
        </label>
        <Field
          label="Ключ Novofon"
          value={integrations.novofonApiKey || ''}
          onChange={(value) => patchIntegrations({ novofonApiKey: value })}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="Секрет webhook"
            value={integrations.novofonWebhookSecret || ''}
            onChange={(value) =>
              patchIntegrations({ novofonWebhookSecret: value })
            }
          />
          <Field label="Webhook URL" value={novofonWebhookUrl} readOnly />
        </div>
        <IntegrationDiagnostics state={status?.novofon} />
        <IntegrationActions
          provider="Novofon"
          webhookUrl={novofonWebhookUrl}
          disabled={access && !access.allowTelephony}
          loading={actionLoading.startsWith('novofon:')}
          onConnect={() =>
            runIntegrationAction({
              provider: 'novofon',
              action: 'connect',
              body: {
                apiKey: integrations.novofonApiKey,
                virtualPhone: integrations.novofonVirtualPhone,
              },
            })
          }
          onCheck={() =>
            runIntegrationAction({
              provider: 'novofon',
              action: 'check',
              method: 'GET',
            })
          }
          onDisconnect={() =>
            runIntegrationAction({
              provider: 'novofon',
              action: 'disconnect',
            })
          }
        />
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="AITunnel / AI"
        description="Ключ и модели AI на уровне компании."
        locked={aiLocked}
        indicatorState={aiIndicatorState}
      >
        <Field
          label="AITunnel key"
          type="password"
          value={integrations.aitunnelKey || ''}
          onChange={(value) => patchIntegrations({ aitunnelKey: value })}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="AI transcription provider"
            value={integrations.aiTranscriptionProvider || ''}
            placeholder="aitunnel"
            onChange={(value) =>
              patchIntegrations({ aiTranscriptionProvider: value })
            }
          />
          <Field
            label="AI transcription model"
            value={integrations.aiTranscriptionModel || ''}
            placeholder="whisper-1"
            onChange={(value) =>
              patchIntegrations({ aiTranscriptionModel: value })
            }
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="AI analysis provider"
            value={integrations.aiAnalysisProvider || ''}
            placeholder="aitunnel"
            onChange={(value) =>
              patchIntegrations({ aiAnalysisProvider: value })
            }
          />
          <Field
            label="AI analysis model"
            value={integrations.aiAnalysisModel || ''}
            placeholder="gpt-4o-mini"
            onChange={(value) => patchIntegrations({ aiAnalysisModel: value })}
          />
        </div>
        <IntegrationDiagnostics state={status?.ai} />
        <IntegrationActions
          provider="AI"
          disabled={access && !access.allowAi}
          loading={actionLoading.startsWith('ai:')}
          onCheck={() =>
            runIntegrationAction({
              provider: 'ai',
              action: 'check',
              method: 'GET',
            })
          }
        />
      </CompanyIntegrationCard>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
