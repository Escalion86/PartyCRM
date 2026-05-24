'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

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
  // Нормализация: если первая цифра 8, заменяем на 7
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
  {
    value: 'company',
    label: 'Я управляю компанией',
    roles: ['company'],
  },
  {
    value: 'performer',
    label: 'Я исполнитель',
    roles: ['performer'],
  },
  {
    value: 'both',
    label: 'И компания, и исполнитель',
    roles: ['company', 'performer'],
  },
]

const Field = ({ label, value, onChange, type = 'text' }) => {
  const handleChange = (event) => {
    if (type === 'phone') {
      let inputValue = event.target.value
      // Если поле было пустым и что-то ввели
      if (value === '' && inputValue.length > 0) {
        const digits = inputValue.replace(/[^\d]/g, '')
        if (digits.length > 0) {
          const firstDigit = digits[0]
          if (firstDigit !== '7' && firstDigit !== '8') {
            // Добавляем 7 перед цифрами
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
    return '/company'
  if (value.startsWith('/login') || value.startsWith('/api/')) return '/company'
  return value
}

export default function PartyLoginClient({ callbackUrl = '/company' }) {
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
  const normalizedCallbackUrl = useMemo(
    () => safeCallbackUrl(callbackUrl),
    [callbackUrl]
  )

  const submit = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone.length !== 11) {
      setError('Укажите телефон в формате РФ')
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
      const nextUrl =
        mode === 'register' && interfaceRoleMode === 'performer'
          ? '/performer'
          : normalizedCallbackUrl
      window.location.replace(nextUrl)
    } finally {
      setLoading(false)
    }
  }

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
              <span>Согласен на обработку персональных данных</span>
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
          onClick={() => {
            setError('')
            setMode((value) => (value === 'login' ? 'register' : 'login'))
          }}
        >
          {mode === 'login'
            ? 'Зарегистрироваться в PartyCRM'
            : 'У меня уже есть аккаунт PartyCRM'}
        </button>
      </form>
    </section>
  )
}
