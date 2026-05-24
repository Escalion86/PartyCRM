'use client'

import { useState } from 'react'

const buttonClass =
  'cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export default function PerformerMasterClient({ user }) {
  const [firstName, setFirstName] = useState(user?.firstName || '')
  const [secondName, setSecondName] = useState(user?.secondName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!String(firstName || '').trim()) {
      setError('Укажите имя исполнителя')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/party/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          secondName,
          lastWorkspace: 'performer',
          performerOnboardingCompleted: true,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        setError(payload?.error?.message || payload?.error || 'Не удалось сохранить профиль')
        return
      }

      window.dispatchEvent(new Event('partycrm:profile-updated'))
      window.location.replace('/performer')
    } catch (submitError) {
      setError('Не удалось завершить настройку исполнителя')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-5 py-10">
      <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm shadow-sky-950/5 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          PartyCRM
        </p>
        <h1 className="mt-3 text-3xl font-semibold font-futuraPT text-slate-950 sm:text-4xl">
          Настройте профиль исполнителя
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
          После завершения мастер откроет кабинет исполнителя. Там будут видны
          запросы на привязку от компаний и назначенные вам заказы.
        </p>

        {error ? (
          <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-8 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-700">Имя</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="h-11 rounded-md border border-sky-100 px-3 outline-none focus:border-sky-500"
                placeholder="Имя"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-700">Фамилия</span>
              <input
                type="text"
                value={secondName}
                onChange={(event) => setSecondName(event.target.value)}
                className="h-11 rounded-md border border-sky-100 px-3 outline-none focus:border-sky-500"
                placeholder="Фамилия"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-slate-600">
            Если компания позже отправит вам запрос на привязку, он появится прямо
            в кабинете исполнителя.
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}
            >
              {loading ? 'Сохраняем...' : 'Завершить настройку'}
            </button>
            <a
              href="/party/start"
              className={`${buttonClass} border border-sky-200 bg-white text-sky-700 hover:bg-sky-50`}
            >
              Назад к выбору режима
            </a>
          </div>
        </form>
      </div>
    </section>
  )
}
