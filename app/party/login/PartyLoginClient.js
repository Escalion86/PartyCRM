'use client'

import Link from 'next/link'
import { useMemo, useState, useRef, useCallback, useEffect } from 'react'

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8'))
    return `7${digits.slice(1)}`
  return digits
}

const formatPhone = (value) => {
  let digits = value.replace(/[^\d]/g, '').slice(0, 11)
  if (!digits) return ''
  if (digits[0] === '8') {
    digits = '7' + digits.slice(1)
  }
  let formatted = '+7'
  if (digits.length > 1) formatted += ` (${digits.slice(1, 4)}`
  if (digits.length > 4) formatted += `) ${digits.slice(4, 7)}`
  if (digits.length > 7) formatted += `-${digits.slice(7, 9)}`
  if (digits.length > 9) formatted += `-${digits.slice(9, 11)}`
  return formatted
}

const primaryButtonClass =
  'px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButtonClass =
  'px-4 py-2 text-sm font-semibold transition-colors bg-white border rounded-md cursor-pointer text-sky-700 border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60'

const interfaceRoleOptions = [
  { value: 'company', label: 'Я управляю компанией', roles: ['company'] },
  { value: 'performer', label: 'Я исполнитель', roles: ['performer'] },
  { value: 'both', label: 'И компания, и исполнитель', roles: ['company', 'performer'] },
]

const Field = ({ label, value, onChange, type = 'text' }) => {
  const handleChange = (event) => {
    if (type === 'phone') {
      let inputValue = event.target.value
      if (value === '' && inputValue.length > 0) {
        const digits = inputValue.replace(/[^\d]/g, '')
        if (digits.length > 0) {
          const firstDigit = digits[0]
          if (firstDigit !== '7' && firstDigit !== '8') {
            const normalized = '7' + digits
            const formatted = formatPhone(normalized)
            onChange(formatted)
            return
          }
        }
      }
      const formatted = formatPhone(inputValue)
      onChange(formatted)
    } else {
      onChange(event.target.value)
    }
  }

  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-black/65">{label}</span>
      <input
        type={type === 'phone' ? 'text' : type}
        value={value}
        onChange={handleChange}
        className="h-10 px-3 bg-white border rounded-md outline-none border-sky-100 focus:border-sky-500"
      />
    </label>
  )
}

const safeCallbackUrl = (value) => {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/party/entry'
  if (value.startsWith('/login') || value.startsWith('/api/')) return '/party/entry'
  return value
}

const POLL_INTERVAL_MS = 3000

export default function PartyLoginClient({ callbackUrl = '/party/entry' }) {
  const [mode, setMode] = useState('login')
  const [interfaceRoleMode, setInterfaceRoleMode] = useState('both')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Phone verification state
  const [verifyStep, setVerifyStep] = useState('idle') // idle | calling | waiting | confirmed | sms
  const [verifyCallId, setVerifyCallId] = useState(null)
  const [verifyAuthPhone, setVerifyAuthPhone] = useState('')
  const [verifyError, setVerifyError] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [smsCode, setSmsCode] = useState('')
  const [smsSent, setSmsSent] = useState(false)
  const [smsSending, setSmsSending] = useState(false)
  const pollRef = useRef(null)

  const normalizedCallbackUrl = useMemo(
    () => safeCallbackUrl(callbackUrl),
    [callbackUrl]
  )

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const startPhoneVerification = async () => {
    setVerifyError('')
    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone.length !== 11) {
      setVerifyError('Укажите телефон в формате РФ')
      return
    }

    setVerifyLoading(true)
    setVerifyStep('calling')
    try {
      const response = await fetch('/api/party/auth/phone/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, flow: 'register' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        setVerifyError(payload?.error?.message || 'Не удалось запустить проверку')
        setVerifyStep('idle')
        return
      }
      setVerifyCallId(payload.data.id)
      setVerifyAuthPhone(payload.data.auth_phone || '')
      setVerifyStep('waiting')
      startPolling(payload.data.id, normalizedPhone)
    } catch (err) {
      setVerifyError('Ошибка соединения')
      setVerifyStep('idle')
    } finally {
      setVerifyLoading(false)
    }
  }

  const startPolling = (callId, normalizedPhone) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/party/auth/phone/verify/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: normalizedPhone, callId }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!payload?.success) return

        const { confirmed, status } = payload.data
        if (confirmed) {
          stopPolling()
          setVerifyStep('confirmed')
        } else if (status === 'expired') {
          stopPolling()
          setVerifyStep('idle')
          setVerifyError('Время проверки истекло. Попробуйте снова.')
        }
      } catch (err) {
        // Игнорируем ошибки поллинга
      }
    }, POLL_INTERVAL_MS)
  }

  const requestSmsCode = async () => {
    setSmsSending(true)
    setVerifyError('')
    const normalizedPhone = normalizePhone(phone)
    try {
      const response = await fetch('/api/party/auth/phone/verify/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, flow: 'register' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        setVerifyError(payload?.error?.message || 'Не удалось отправить SMS')
        return
      }
      setSmsSent(true)
      if (payload.data?.alreadyConfirmed) {
        stopPolling()
        setVerifyStep('confirmed')
      }
      if (payload.data?.debugCode) {
        console.info('[PartyCRM dev] SMS code:', payload.data.debugCode)
      }
    } catch (err) {
      setVerifyError('Ошибка отправки SMS')
    } finally {
      setSmsSending(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone.length !== 11) {
      setError('Укажите телефон в формате РФ')
      return
    }

    // Для регистрации требуем подтверждённый телефон
    if (mode === 'register' && verifyStep !== 'confirmed') {
      setError('Сначала подтвердите номер телефона')
      return
    }

    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов')
      return
    }
    if (mode === 'register' && password !== passwordRepeat) {
      setError('Пароли не совпадают')
      return
    }
    const interfaceRoles = interfaceRoleOptions.find(
      (option) => option.value === interfaceRoleMode
    )?.roles || ['company', 'performer']

    setLoading(true)
    try {
      const response = await fetch(
        mode === 'register'
          ? '/api/party/auth/register'
          : '/api/party/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: normalizedPhone,
            password,
            firstName,
            secondName,
            interfaceRoles,
            consentPrivacyPolicy: privacyAccepted,
            consentPersonalData: personalDataAccepted,
          }),
        }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        setError(payload?.error || 'Не удалось войти')
        return
      }
      window.location.replace(normalizedCallbackUrl)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setError('')
    setVerifyStep('idle')
    setVerifyError('')
    setVerifyCallId(null)
    setSmsSent(false)
    setSmsCode('')
    stopPolling()
    setMode((value) => (value === 'login' ? 'register' : 'login'))
  }

  const authPhoneDisplay = verifyAuthPhone
    ? verifyAuthPhone.replace(/^7/, '+7').replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 ($2) $3-$4-$5')
    : ''

  return (
    <section className="max-w-xl px-5 py-10 mx-auto">
      <p className="text-sm font-semibold uppercase text-sky-700">PartyCRM</p>
      <h1 className="mt-3 text-3xl font-semibold font-futuraPT sm:text-4xl">
        {mode === 'register' ? 'Регистрация компании' : 'Вход в PartyCRM'}
      </h1>
      <p className="mt-4 leading-7 text-slate-700">
        Создайте рабочее пространство компании или войдите, чтобы управлять
        заявками, площадками, исполнителями и подготовкой мероприятий.
      </p>

      {error && (
        <div className="p-3 mt-5 text-sm border rounded-md border-danger/30 bg-danger/10 text-danger">
          {error}
        </div>
      )}

      <form
        onSubmit={submit}
        className="grid gap-4 p-5 mt-6 bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5"
      >
        <Field label="Телефон" value={phone} onChange={setPhone} type="phone" />

        {/* Phone verification for registration */}
        {mode === 'register' && (
          <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-4">
            {verifyStep === 'idle' && (
              <div className="grid gap-3">
                <p className="text-sm text-slate-600">
                  Подтвердите номер телефона звонком или SMS
                </p>
                {verifyError && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                    {verifyError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={startPhoneVerification}
                  disabled={verifyLoading}
                  className={secondaryButtonClass}
                >
                  {verifyLoading ? 'Звоним...' : 'Позвонить для подтверждения'}
                </button>
              </div>
            )}

            {verifyStep === 'calling' && (
              <div className="grid gap-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-sky-500" />
                  Звоним на номер...
                </div>
                {verifyError && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                    {verifyError}
                  </div>
                )}
              </div>
            )}

            {verifyStep === 'waiting' && (
              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-500" />
                  Ожидаем звонок на номер{authPhoneDisplay ? ` ${authPhoneDisplay}` : ''}...
                  <br />
                  Возьмите трубку — подтверждение произойдёт автоматически.
                </div>
                {verifyError && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
                    {verifyError}
                  </div>
                )}
                <div className="flex gap-2">
                  {!smsSent && (
                    <button
                      type="button"
                      onClick={requestSmsCode}
                      disabled={smsSending}
                      className={secondaryButtonClass}
                    >
                      {smsSending ? 'Отправляем...' : 'Не могу принять звонок — получить SMS'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      stopPolling()
                      setVerifyStep('idle')
                      setVerifyError('')
                    }}
                    className={secondaryButtonClass}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {verifyStep === 'confirmed' && (
              <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Телефон подтверждён ✓
              </div>
            )}

            {smsSent && verifyStep === 'waiting' && (
              <p className="mt-2 text-xs text-slate-500">
                SMS отправлено. Введите код из SMS в поле ниже или дождитесь звонка.
              </p>
            )}
          </div>
        )}

        <Field
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
        />
        {mode === 'register' && (
          <>
            <Field
              label="Повторите пароль"
              type="password"
              value={passwordRepeat}
              onChange={setPasswordRepeat}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Имя" value={firstName} onChange={setFirstName} />
              <Field
                label="Фамилия"
                value={secondName}
                onChange={setSecondName}
              />
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium text-black/65">
                Как вы будете пользоваться PartyCRM
              </p>
              <div className="grid gap-2">
                {interfaceRoleOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      interfaceRoleMode === option.value
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="party-interface-role"
                      value={option.value}
                      checked={interfaceRoleMode === option.value}
                      onChange={() => setInterfaceRoleMode(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(event) => setPrivacyAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>
                Принимаю{' '}
                <Link href="/privacy" className="underline text-sky-700">
                  Политику конфиденциальности
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={personalDataAccepted}
                onChange={(event) =>
                  setPersonalDataAccepted(event.target.checked)
                }
                className="mt-1"
              />
              <span>
                Согласен с{' '}
                <Link
                  href="/personal-data-consent"
                  className="underline text-sky-700"
                >
                  Согласием на обработку персональных данных
                </Link>
              </span>
            </label>
          </>
        )}

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading
            ? 'Подождите...'
            : mode === 'register'
              ? 'Создать аккаунт PartyCRM'
              : 'Войти'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={switchMode}
        >
          {mode === 'login'
            ? 'Зарегистрироваться в PartyCRM'
            : 'У меня уже есть аккаунт PartyCRM'}
        </button>
      </form>
    </section>
  )
}
