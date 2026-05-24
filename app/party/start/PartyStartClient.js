'use client'

import { useMemo, useState } from 'react'

const options = [
  {
    value: 'company',
    label: 'Я управляю компанией',
    description:
      'Откроется мастер создания компании, после чего вы попадете в кабинет компании.',
    roles: ['company'],
    nextPath: '/company/master',
    lastWorkspace: 'company',
  },
  {
    value: 'performer',
    label: 'Я исполнитель',
    description:
      'Откроется мастер настройки профиля исполнителя, затем вы попадете в кабинет исполнителя.',
    roles: ['performer'],
    nextPath: '/performer/master',
    lastWorkspace: 'performer',
  },
  {
    value: 'both',
    label: 'И компания, и исполнитель',
    description:
      'Сначала настроим кабинет компании. Кабинет исполнителя можно будет включить и завершить отдельно.',
    roles: ['company', 'performer'],
    nextPath: '/company/master',
    lastWorkspace: 'company',
  },
]

const buttonClass =
  'cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export default function PartyStartClient({ user }) {
  const [mode, setMode] = useState('company')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedOption = useMemo(
    () => options.find((option) => option.value === mode) || options[0],
    [mode]
  )

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/party/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interfaceRoles: selectedOption.roles,
          lastWorkspace: selectedOption.lastWorkspace,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        setError(payload?.error?.message || payload?.error || 'Не удалось сохранить выбор')
        return
      }

      window.dispatchEvent(new Event('partycrm:profile-updated'))
      window.location.replace(selectedOption.nextPath)
    } catch (submitError) {
      setError('Не удалось сохранить выбор режима')
    } finally {
      setLoading(false)
    }
  }

  const displayName = [user?.firstName, user?.secondName].filter(Boolean).join(' ')

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-sky-100 bg-white p-6 shadow-sm shadow-sky-950/5 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
        PartyCRM
      </p>
      <h1 className="mt-3 text-3xl font-semibold font-futuraPT text-slate-950 sm:text-4xl">
        Выберите, как вы будете работать
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
        {displayName ? `${displayName}, ` : ''}настроим PartyCRM под ваш сценарий:
        кабинет компании, кабинет исполнителя или оба режима сразу.
      </p>

      {error ? (
        <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={`grid cursor-pointer gap-2 rounded-2xl border p-5 transition-colors ${
              mode === option.value
                ? 'border-sky-500 bg-sky-50'
                : 'border-sky-100 bg-white hover:bg-sky-50'
            }`}
          >
            <span className="flex items-center gap-3 text-sm font-semibold text-slate-900">
              <input
                type="radio"
                name="party-start-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              {option.label}
            </span>
            <span className="pl-7 text-sm leading-6 text-slate-500">
              {option.description}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}
        >
          {loading ? 'Сохраняем...' : 'Продолжить'}
        </button>
        <a
          href="/party"
          className={`${buttonClass} border border-sky-200 bg-white text-sky-700 hover:bg-sky-50`}
        >
          Вернуться на главную
        </a>
      </div>
    </section>
  )
}
