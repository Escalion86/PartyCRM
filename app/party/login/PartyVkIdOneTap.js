'use client'

import { useEffect, useRef, useState } from 'react'

const VK_SDK_URL = 'https://unpkg.com/@vkid/sdk@2.6.1/dist-sdk/umd/index.js'
const VK_SDK_SCRIPT_ID = 'partycrm-vkid-sdk'

let vkSdkPromise = null

const loadVkSdk = () => {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('no_window'))
  if (window.VKIDSDK) return Promise.resolve(window.VKIDSDK)
  if (vkSdkPromise) return vkSdkPromise

  vkSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(VK_SDK_SCRIPT_ID)
    const handleLoad = () =>
      window.VKIDSDK
        ? resolve(window.VKIDSDK)
        : reject(new Error('sdk_missing'))
    const handleError = () => reject(new Error('sdk_load_failed'))

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = VK_SDK_SCRIPT_ID
    script.src = VK_SDK_URL
    script.async = true
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.appendChild(script)
  }).catch((error) => {
    vkSdkPromise = null
    throw error
  })

  return vkSdkPromise
}

const getErrorMessage = (payload) => {
  const code = payload?.error?.code || ''
  if (code === 'VK_PROFILE_NOT_FOUND')
    return payload?.error?.message || 'Аккаунт PartyCRM не найден'
  if (code === 'VK_PHONE_REQUIRED')
    return 'VK ID не передал номер телефона. Проверьте настройки профиля VK.'
  if (code === 'VK_CONFIG_MISSING')
    return 'Авторизация через VK ID временно недоступна'
  if (code === 'VK_EXCHANGE_FAILED')
    return 'Не удалось подтвердить вход через VK ID'
  if (code === 'VK_STATE_MISMATCH')
    return 'Сессия входа через VK ID устарела. Попробуйте ещё раз.'
  if (code === 'VK_USERINFO_FAILED' || code === 'VK_PROFILE_INVALID')
    return 'Не удалось получить профиль VK ID'
  if (code === 'VK_USER_DUPLICATE_CONFLICT')
    return payload?.error?.message || 'Конфликт данных аккаунта'
  if (code === 'CONSENT_REQUIRED')
    return 'Для регистрации примите все юридические согласия'
  return payload?.error?.message || 'Не удалось войти через VK ID'
}

export default function PartyVkIdOneTap({
  flow,
  callbackUrl,
  interfaceRoles = [],
  consentTerms = false,
  consentPrivacyPolicy = false,
  consentPersonalData = false,
  children = null,
}) {
  const containerRef = useRef(null)
  const [config, setConfig] = useState({ loaded: false, enabled: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [renderNonce, setRenderNonce] = useState(0)
  const registrationReady =
    flow !== 'register' ||
    (consentTerms && consentPrivacyPolicy && consentPersonalData)

  useEffect(() => {
    let active = true

    fetch('/api/party/auth/vk-status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return
        setConfig({
          loaded: true,
          enabled: Boolean(payload?.data?.enabled),
          appId: payload?.data?.appId || '',
          redirectUri: payload?.data?.redirectUri || '',
          scope: payload?.data?.scope || 'phone email',
        })
      })
      .catch(() => {
        if (active) setConfig({ loaded: true, enabled: false })
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!config.enabled || !registrationReady) return undefined
    const container = containerRef.current
    const appId = Number(config.appId)
    if (!container || !Number.isFinite(appId) || appId <= 0) return undefined

    let active = true
    container.innerHTML = ''

    loadVkSdk()
      .then((VKID) => {
        if (!active) return

        VKID.Config.init({
          app: appId,
          redirectUrl: config.redirectUri,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          scope: config.scope,
        })

        const oneTap = new VKID.OneTap()
        oneTap
          .render({ container, showAlternativeLogin: true })
          .on(VKID.WidgetEvents.ERROR, () => {
            if (active) setError('Не удалось загрузить кнопку VK ID')
          })
          .on(VKID.OneTapInternalEvents.LOGIN_SUCCESS, async (vkPayload) => {
            setError('')
            setLoading(true)

            try {
              const code = vkPayload?.code || ''
              const deviceId = vkPayload?.device_id || vkPayload?.deviceId || ''
              const codeVerifier =
                vkPayload?.code_verifier || vkPayload?.codeVerifier || ''
              let accessToken = ''

              if (!code || !deviceId) {
                throw new Error('Некорректный ответ VK ID')
              }
              if (!codeVerifier && VKID?.Auth?.exchangeCode) {
                const tokens = await VKID.Auth.exchangeCode(code, deviceId)
                accessToken = tokens?.access_token || tokens?.accessToken || ''
              }

              const response = await fetch('/api/party/auth/vk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  flow,
                  code,
                  deviceId,
                  codeVerifier,
                  accessToken,
                  state: vkPayload?.state || '',
                  interfaceRoles,
                  consentTerms,
                  consentPrivacyPolicy,
                  consentPersonalData,
                }),
              })
              const payload = await response.json().catch(() => ({}))
              if (!response.ok || payload?.success === false) {
                throw new Error(getErrorMessage(payload))
              }

              window.location.replace(callbackUrl)
            } catch (authError) {
              if (active) {
                setError(authError?.message || 'Не удалось войти через VK ID')
                setRenderNonce((value) => value + 1)
              }
            } finally {
              if (active) setLoading(false)
            }
          })
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить VK ID')
      })

    return () => {
      active = false
      container.innerHTML = ''
    }
  }, [
    callbackUrl,
    config,
    consentPersonalData,
    consentPrivacyPolicy,
    consentTerms,
    flow,
    interfaceRoles,
    registrationReady,
    renderNonce,
  ])

  if (!config.loaded || !config.enabled) return null

  return (
    <div className="grid gap-2">
      {children}
      {registrationReady ? (
        <>
          <div ref={containerRef} className="min-h-11 w-full" />
          {loading && (
            <p className="text-center text-sm text-slate-500">
              Подтверждаем вход через VK ID...
            </p>
          )}
        </>
      ) : (
        <p className="rounded-md bg-sky-50 p-3 text-sm text-slate-600">
          Чтобы зарегистрироваться через VK ID, примите все согласия выше.
        </p>
      )}
      {error && (
        <p className="border-danger/30 bg-danger/10 text-danger rounded-md border p-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 py-1 text-xs text-slate-400">
        <span className="h-px flex-1 bg-sky-100" />
        <span>или по телефону</span>
        <span className="h-px flex-1 bg-sky-100" />
      </div>
    </div>
  )
}
