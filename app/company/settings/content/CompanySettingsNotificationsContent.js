'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getPushRegistration,
  isPushSupported,
  syncPushSubscription,
} from '@helpers/pushClient'
import useCompanySettings from '../useCompanySettings'

const DEFAULT_REMINDER_TIME = '10:00'

const normalizeReminderDaysBefore = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(30, Math.max(0, Math.floor(parsed)))
}

export default function CompanySettingsNotificationsContent({
  activeCompanyId,
}) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)
  const [pushBusy, setPushBusy] = useState('')
  const [pushError, setPushError] = useState('')
  const [pushMessage, setPushMessage] = useState('')
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushSubscribed, setPushSubscribed] = useState(false)

  const notifications = settings?.notifications ?? {}
  const pushEnabled = notifications.pushEnabled === true
  const reminderTime =
    typeof notifications.additionalEventsPushTime === 'string' &&
    notifications.additionalEventsPushTime
      ? notifications.additionalEventsPushTime
      : DEFAULT_REMINDER_TIME
  const reminderDaysBefore = normalizeReminderDaysBefore(
    notifications.additionalEventsReminderDaysBefore
  )
  const partyPushHeaders = activeCompanyId
    ? { 'x-partycrm-company-id': activeCompanyId }
    : {}

  const refreshPushState = useCallback(async () => {
    const available = isPushSupported()
    setPushAvailable(available)
    setPushPermission(available ? Notification.permission : 'unsupported')
    if (!available) {
      setPushSubscribed(false)
      return
    }

    const registration = await getPushRegistration()
    const subscription = await registration?.pushManager
      ?.getSubscription()
      .catch(() => null)
    setPushSubscribed(Boolean(subscription))
  }, [])

  useEffect(() => {
    refreshPushState()
  }, [refreshPushState])

  const enablePush = async () => {
    setPushBusy('enable')
    setPushError('')
    setPushMessage('')
    try {
      if (!isPushSupported()) {
        throw new Error('Push-уведомления не поддерживаются на этом устройстве')
      }
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        throw new Error('Разрешение на push-уведомления не выдано')
      }

      const result = await syncPushSubscription({
        ensureLocalSubscription: true,
        apiBasePath: '/api/party/push',
        headers: partyPushHeaders,
      })
      if (!result?.ok) {
        throw new Error('Не удалось создать push-подписку')
      }
      await savePatch({
        notifications: {
          ...notifications,
          pushEnabled: true,
        },
      })
      setPushSubscribed(true)
      setPushMessage('Push-уведомления подключены')
    } catch (pushLoadError) {
      setPushError(pushLoadError.message || 'Не удалось подключить push')
    } finally {
      setPushBusy('')
      refreshPushState()
    }
  }

  const disablePush = async () => {
    setPushBusy('disable')
    setPushError('')
    setPushMessage('')
    try {
      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager
        ?.getSubscription()
        .catch(() => null)
      if (subscription) {
        await fetch('/api/party/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...partyPushHeaders },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
        await subscription.unsubscribe().catch(() => null)
      }
      await savePatch({
        notifications: {
          ...notifications,
          pushEnabled: false,
        },
      })
      setPushSubscribed(false)
      setPushMessage('Push-уведомления отключены')
    } catch (pushLoadError) {
      setPushError(pushLoadError.message || 'Не удалось отключить push')
    } finally {
      setPushBusy('')
      refreshPushState()
    }
  }

  const sendTestPush = async () => {
    setPushBusy('test')
    setPushError('')
    setPushMessage('')
    try {
      await syncPushSubscription({
        ensureLocalSubscription: true,
        apiBasePath: '/api/party/push',
        headers: partyPushHeaders,
      })
      const response = await fetch('/api/party/push/test', {
        method: 'POST',
        headers: partyPushHeaders,
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Не удалось отправить тест push')
      }
      setPushMessage('Тестовое push-уведомление отправлено')
    } catch (pushLoadError) {
      setPushError(pushLoadError.message || 'Не удалось отправить тест push')
    } finally {
      setPushBusy('')
      refreshPushState()
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки уведомлений...
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
      {pushError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {pushError}
        </div>
      ) : null}
      {pushMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {pushMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="grid gap-3">
          <div>
            <div className="text-sm font-semibold">
              Push-уведомления компании
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Статус: {pushEnabled ? 'включены' : 'отключены'} · Поддержка:{' '}
              {pushAvailable ? 'есть' : 'нет'} · Разрешение: {pushPermission} ·
              Подписка: {pushSubscribed ? 'активна' : 'нет'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={pushEnabled ? disablePush : enablePush}
              disabled={Boolean(pushBusy) || !pushAvailable}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pushBusy === 'enable'
                ? 'Подключаем...'
                : pushBusy === 'disable'
                  ? 'Отключаем...'
                  : pushEnabled
                    ? 'Отключить push'
                    : 'Включить push'}
            </button>
            <button
              type="button"
              onClick={sendTestPush}
              disabled={Boolean(pushBusy) || !pushAvailable}
              className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              {pushBusy === 'test' ? 'Отправляем...' : 'Тест push'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold">
              Время ежедневных напоминаний
            </span>
            <input
              type="time"
              step="900"
              value={reminderTime}
              onChange={(event) =>
                savePatch({
                  notifications: {
                    ...notifications,
                    additionalEventsPushTime: event.target.value,
                  },
                })
              }
              className="h-11 max-w-52 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">
              За сколько дней до даты напоминать
            </span>
            <input
              type="number"
              min="0"
              max="30"
              step="1"
              value={reminderDaysBefore}
              onChange={(event) =>
                savePatch({
                  notifications: {
                    ...notifications,
                    additionalEventsReminderDaysBefore:
                      normalizeReminderDaysBefore(event.target.value),
                  },
                })
              }
              className="h-11 max-w-52 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
        </div>
      </div>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
