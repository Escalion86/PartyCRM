'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import useCompanySettings from '../useCompanySettings'

const createSecret = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}`
}

const buildOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin.replace(/\/+$/, '')

const CompanyIntegrationCard = ({
  title,
  description,
  children,
  note = '',
  locked = false,
}) => (
  <div
    className={`rounded-2xl border p-5 ${
      locked ? 'border-amber-200 bg-amber-50' : 'border-sky-100 bg-white'
    }`}
  >
    <div className="text-base font-semibold">{title}</div>
    <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    {locked ? (
      <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
        Недоступно на текущем тарифе компании.
      </div>
    ) : null}
    {note ? (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        {note}
      </div>
    ) : null}
    <div className={locked ? 'pointer-events-none mt-4 grid gap-3 opacity-50' : 'mt-4 grid gap-3'}>
      {children}
    </div>
  </div>
)

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

export default function CompanySettingsIntegrationsContent({ activeCompanyId }) {
  const { settings, access, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [statusLoading, setStatusLoading] = useState(true)

  useEffect(() => {
    if (!activeCompanyId) return
    let cancelled = false
    apiJson('/api/party/integrations/status', {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': activeCompanyId },
    })
      .then((response) => {
        if (cancelled) return
        setStatus(response.data ?? {})
        setStatusError('')
      })
      .catch((loadError) => {
        if (cancelled) return
        setStatusError(
          loadError.message || 'Не удалось загрузить состояние интеграций'
        )
      })
      .finally(() => {
        if (cancelled) return
        setStatusLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeCompanyId, settings?.integrations])

  const integrations = settings?.integrations ?? {}
  const origin = buildOrigin()

  const avitoWebhookUrl = useMemo(() => {
    const token = integrations.avitoWebhookToken || ''
    return token ? `${origin}/api/integrations/avito/webhook/${token}` : ''
  }, [integrations.avitoWebhookToken, origin])

  const vkWebhookUrl = useMemo(() => {
    const token = integrations.vkGroupWebhookToken || ''
    return token ? `${origin}/api/integrations/vk/webhook/${token}` : ''
  }, [integrations.vkGroupWebhookToken, origin])

  const novofonWebhookUrl = useMemo(() => {
    const secret = integrations.novofonWebhookSecret || ''
    return secret
      ? `${origin}/api/telephony/novofon/webhook?tenantId=${activeCompanyId}&secret=${secret}`
      : ''
  }, [activeCompanyId, integrations.novofonWebhookSecret, origin])

  const patchIntegrations = (patch) =>
    savePatch({
      integrations: {
        ...integrations,
        ...patch,
      },
    })

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

      <CompanyIntegrationCard
        title="Avito"
        description="Поля подключения и webhook компании для Avito."
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
          <div className="text-xs text-slate-500">
            Статус: {status?.avito?.status || 'not_connected'}
          </div>
        )}
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="VK"
        description="Настройки группы VK и Callback API на уровне компании."
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
          <div className="text-xs text-slate-500">
            Статус: {status?.vk?.status || 'not_connected'}
          </div>
        )}
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="Novofon"
        description="Секрет webhook и ключ телефонии компании."
        locked={access && !access.allowTelephony}
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
      </CompanyIntegrationCard>

      <CompanyIntegrationCard
        title="AITunnel / AI"
        description="Ключ и модели AI на уровне компании."
        locked={access && !access.allowAi}
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
      </CompanyIntegrationCard>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
