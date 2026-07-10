'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getPushRegistration,
  isPushSupported,
  syncPushSubscription,
} from '@helpers/pushClient'

const NOTIFICATIONS_API = '/api/party/performer/notifications'
const PARTY_PUSH_API = '/api/party/push'

export default function PerformerSettingsNotificationsContent() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushBusy, setPushBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [notifications, setNotifications] = useState({ pushEnabled: true })

  const pushEnabled = notifications.pushEnabled !== false
  const pushConnected = pushEnabled && pushSubscribed

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

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(NOTIFICATIONS_API, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Не удалось загрузить настройки')
      }
      setNotifications(payload?.data?.notifications || { pushEnabled: true })
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveNotifications = async (patch) => {
    setSaving(true)
    const nextNotifications = { ...notifications, ...patch }
    const response = await fetch(NOTIFICATIONS_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifications: nextNotifications }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || 'Не удалось сохранить настройки')
    }
    setNotifications(payload?.data?.notifications || nextNotifications)
    setSaving(false)
  }

  useEffect(() => {
    loadSettings()
    refreshPushState()
  }, [loadSettings, refreshPushState])

  const enablePush = async () => {
    setPushBusy('enable')
    setError('')
    setMessage('')
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
        apiBasePath: PARTY_PUSH_API,
      })
      if (!result?.ok) {
        throw new Error('Не удалось создать push-подписку')
      }
      await saveNotifications({ pushEnabled: true })
      setPushSubscribed(true)
      setMessage('Push-уведомления подключены')
    } catch (pushError) {
      setError(pushError.message || 'Не удалось подключить push')
      setSaving(false)
    } finally {
      setPushBusy('')
      refreshPushState()
    }
  }

  const disablePush = async () => {
    setPushBusy('disable')
    setError('')
    setMessage('')
    try {
      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager
        ?.getSubscription()
        .catch(() => null)
      if (subscription) {
        await fetch(`${PARTY_PUSH_API}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
        await subscription.unsubscribe().catch(() => null)
      }
      await saveNotifications({ pushEnabled: false })
      setPushSubscribed(false)
      setMessage('Push-уведомления отключены')
    } catch (pushError) {
      setError(pushError.message || 'Не удалось отключить push')
      setSaving(false)
    } finally {
      setPushBusy('')
      refreshPushState()
    }
  }

  const sendTestPush = async () => {
    setPushBusy('test')
    setError('')
    setMessage('')
    try {
      await syncPushSubscription({
        ensureLocalSubscription: true,
        apiBasePath: PARTY_PUSH_API,
      })
      const response = await fetch('/api/party/performer/push/test', {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Не удалось отправить тест push')
      }
      setMessage('Тестовое push-уведомление отправлено')
    } catch (pushError) {
      setError(pushError.message || 'Не удалось отправить тест push')
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
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="grid gap-3">
          <div>
            <div className="text-sm font-semibold">
              Push-уведомления исполнителя
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
              onClick={pushConnected ? disablePush : enablePush}
              disabled={Boolean(pushBusy) || !pushAvailable}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pushBusy === 'enable'
                ? 'Подключаем...'
                : pushBusy === 'disable'
                  ? 'Отключаем...'
                  : pushConnected
                    ? 'Отключить push'
                    : 'Включить push'}
            </button>
            <button
              type="button"
              onClick={sendTestPush}
              disabled={Boolean(pushBusy) || !pushAvailable || !pushEnabled}
              className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              {pushBusy === 'test' ? 'Отправляем...' : 'Тест push'}
            </button>
          </div>
        </div>
      </div>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
