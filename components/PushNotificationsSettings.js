'use client'

import { useAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import {
  getPushRegistration,
  isPushSupported,
  syncPushSubscription,
} from '@helpers/pushClient'

const DEFAULT_ADDITIONAL_EVENTS_PUSH_TIME = '10:00'
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeReminderTime = (value) => {
  const raw = String(value || '').trim()
  return REMINDER_TIME_PATTERN.test(raw)
    ? raw
    : DEFAULT_ADDITIONAL_EVENTS_PUSH_TIME
}

const PushNotificationsSettings = () => {
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const snackbar = useSnackbar()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushAction, setPushAction] = useState('')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushLogs, setPushLogs] = useState([])
  const [pushLogsLoading, setPushLogsLoading] = useState(false)
  const customSettings = siteSettings?.custom ?? {}
  const isPushEnabled =
    getCustomValue(customSettings, 'publicLeadPushEnabled') === true
  const additionalEventsPushTime = normalizeReminderTime(
    getCustomValue(customSettings, 'additionalEventsPushTime')
  )

  const refreshPushLogs = useCallback(async () => {
    setPushLogsLoading(true)
    try {
      const response = await fetch('/api/push/logs?limit=10')
      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload?.success && Array.isArray(payload?.data)) {
        setPushLogs(payload.data)
      }
    } finally {
      setPushLogsLoading(false)
    }
  }, [])

  const saveCustom = useCallback(
    async (patch) => {
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            ...patch,
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        null
      )
    },
    [setSiteSettings, siteSettings?.custom]
  )

  const refreshPushState = useCallback(async () => {
    const available = isPushSupported()
    setPushAvailable(available)
    setPushPermission(available ? Notification.permission : 'unsupported')
    if (!available) {
      setPushSubscribed(false)
      return
    }

    const registration = await getPushRegistration()
    if (!registration?.pushManager) {
      setPushSubscribed(false)
      return
    }

    let subscription = await registration.pushManager
      .getSubscription()
      .catch(() => null)

    if (isPushEnabled && Notification.permission === 'granted') {
      try {
        const syncResult = await syncPushSubscription({
          registration,
          subscription,
          ensureLocalSubscription: true,
        })
        if (syncResult?.ok && syncResult?.subscription) {
          subscription = syncResult.subscription
        }
      } catch (error) {
        // UI should still show local browser state if backend sync fails.
      }
    }

    setPushSubscribed(Boolean(subscription))
  }, [isPushEnabled])

  useEffect(() => {
    refreshPushState()
    refreshPushLogs()
  }, [refreshPushLogs, refreshPushState])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshPushState()
    }
    const handleFocus = () => refreshPushState()

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshPushState])

  const enablePushNotifications = async () => {
    if (!isPushSupported()) {
      snackbar.warning('Push-уведомления не поддерживаются на этом устройстве')
      return
    }

    setPushBusy(true)
    setPushAction('enable')
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        snackbar.warning('Разрешение на уведомления не выдано')
        return
      }

      const registration = await getPushRegistration()
      if (!registration?.pushManager) {
        snackbar.error('Service Worker не готов для push')
        return
      }

      await syncPushSubscription({
        registration,
        ensureLocalSubscription: true,
      })

      await saveCustom({ publicLeadPushEnabled: true })
      setPushSubscribed(true)
      refreshPushLogs()
      snackbar.success('Push-уведомления включены')
    } catch (error) {
      snackbar.error(
        error?.message
          ? `Не удалось включить push-уведомления: ${error.message}`
          : 'Не удалось включить push-уведомления'
      )
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const disablePushNotifications = async () => {
    setPushBusy(true)
    setPushAction('disable')
    try {
      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager
        ?.getSubscription()
        .catch(() => null)

      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
        await subscription.unsubscribe().catch(() => null)
      }

      await saveCustom({ publicLeadPushEnabled: false })
      setPushSubscribed(false)
      refreshPushLogs()
      snackbar.success('Push-уведомления отключены')
    } catch (error) {
      snackbar.error('Не удалось отключить push-уведомления')
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const sendTestPush = async () => {
    if (!isPushEnabled) {
      snackbar.warning('Сначала включите push-уведомления')
      return
    }

    setPushBusy(true)
    setPushAction('test')
    try {
      if (Notification.permission === 'granted') {
        await syncPushSubscription({ ensureLocalSubscription: true })
      }

      let response = await fetch('/api/push/test', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      const hasDeliveryErrors =
        Number(payload?.data?.failed || 0) > 0 ||
        Number(payload?.data?.deactivated || 0) > 0

      if (hasDeliveryErrors) {
        await syncPushSubscription({
          ensureLocalSubscription: true,
          forceNewSubscription: true,
        })
        response = await fetch('/api/push/test', { method: 'POST' })
        const retryPayload = await response.json().catch(() => ({}))
        if (response.ok && retryPayload?.success) {
          snackbar.success(
            `Подписка обновлена, тест отправлен: ${Number(
              retryPayload?.data?.sent || 0
            )}`
          )
          refreshPushLogs()
          return
        }
      }

      if (!response.ok || !payload?.success) {
        snackbar.error(payload?.error || 'Не удалось отправить тест')
        return
      }

      const sent = Number(payload?.data?.sent || 0)
      if (sent <= 0) {
        snackbar.warning('Тест отправлен, но активных подписок не найдено')
        refreshPushLogs()
        return
      }
      snackbar.success(`Тест отправлен: ${sent}`)
      refreshPushLogs()
    } catch (error) {
      snackbar.error('Не удалось отправить тест push')
    } finally {
      setPushBusy(false)
      setPushAction('')
      refreshPushState()
    }
  }

  const saveAdditionalEventsPushTime = async (value) => {
    const nextValue = normalizeReminderTime(value)
    try {
      await saveCustom({ additionalEventsPushTime: nextValue })
      snackbar.success(`Время напоминаний: ${nextValue}`)
    } catch (error) {
      snackbar.error('Не удалось сохранить время напоминаний')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-gray-600">
        Push-уведомления приходят в установленное PWA-приложение по новым
        входящим API-заявкам и системным напоминаниям.
      </div>
      <div className="text-xs text-gray-500">
        Статус: {pushAvailable ? 'поддерживается' : 'не поддерживается'} |
        Разрешение: {pushPermission} | Подписка:{' '}
        {pushSubscribed ? 'активна' : 'нет'}
      </div>
      <div className="flex items-center">
        <span
          className={`inline-flex min-w-[110px] items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
            isPushEnabled
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-gray-100 text-gray-700'
          }`}
        >
          {isPushEnabled ? 'Подключено' : 'Отключено'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`action-icon-button flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold tablet:w-auto ${
            isPushEnabled
              ? 'action-icon-button--danger'
              : 'action-icon-button--success'
          }`}
          onClick={() => {
            if (!pushAvailable || pushBusy) return
            if (isPushEnabled) disablePushNotifications()
            else enablePushNotifications()
          }}
          disabled={pushBusy || !pushAvailable}
        >
          {pushBusy && pushAction === 'enable'
            ? 'Подключаем...'
            : pushBusy && pushAction === 'disable'
              ? 'Отключаем...'
              : isPushEnabled
                ? 'Отключить push'
                : 'Включить push'}
        </button>
        <button
          type="button"
          className="action-icon-button action-icon-button--warning flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold tablet:w-auto"
          onClick={sendTestPush}
          disabled={pushBusy || !pushAvailable}
        >
          {pushBusy && pushAction === 'test' ? 'Отправка...' : 'Тест push'}
        </button>
      </div>
      <div className="rounded border border-gray-200 bg-white/70 p-3">
        <label className="flex flex-col gap-2 text-sm text-gray-700 tablet:max-w-xs">
          <span className="font-semibold text-gray-800">
            Время ежедневных напоминаний
          </span>
          <input
            type="time"
            step="900"
            value={additionalEventsPushTime}
            className="h-10 cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm"
            onChange={(event) => saveAdditionalEventsPushTime(event.target.value)}
          />
        </label>
        <div className="mt-2 text-xs text-gray-500">
          Проверка cron идет каждые 15 минут. Если время не задано, используется
          10:00 в часовом поясе из настроек профиля.
        </div>
      </div>
      <div className="mt-2 rounded border border-gray-200 bg-white/70 p-3 text-xs">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-800">Последние события push</div>
          <button
            type="button"
            className="cursor-pointer text-general hover:underline"
            onClick={refreshPushLogs}
            disabled={pushLogsLoading}
          >
            {pushLogsLoading ? 'Обновляем...' : 'Обновить'}
          </button>
        </div>
        {pushLogs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {pushLogs.map((log) => {
              const createdAt = log?.createdAt
                ? new Date(log.createdAt).toLocaleString('ru-RU')
                : ''
              const counts =
                log?.sent !== null || log?.failed !== null
                  ? ` | отправлено: ${Number(log?.sent || 0)}, ошибок: ${Number(log?.failed || 0)}, отключено: ${Number(log?.deactivated || 0)}`
                  : ''
              return (
                <div
                  key={log._id}
                  className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-gray-800">
                      {log.status}
                    </span>
                    <span className="text-gray-500">{createdAt}</span>
                    {log.source ? (
                      <span className="text-gray-500">Источник: {log.source}</span>
                    ) : null}
                    {log.statusCode ? (
                      <span className="text-gray-500">HTTP {log.statusCode}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-gray-600">
                    {log.message || log.eventType}
                    {counts}
                  </div>
                  {log.endpointHost || log.endpointHash ? (
                    <div className="mt-1 text-gray-400">
                      Endpoint: {log.endpointHost || 'unknown'}{' '}
                      {log.endpointHash ? `#${log.endpointHash}` : ''}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-gray-500">
            Событий пока нет. Нажмите «Тест push», чтобы проверить доставку.
          </div>
        )}
      </div>
    </div>
  )
}

export default PushNotificationsSettings
