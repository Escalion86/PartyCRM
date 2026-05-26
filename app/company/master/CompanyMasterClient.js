'use client'

import { useState } from 'react'

import { getInitialCompanyTitle } from './companyMasterDefaults'

const buttonClass =
  'cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export default function CompanyMasterClient() {
  const [title, setTitle] = useState(getInitialCompanyTitle)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const normalizedTitle = String(title || '').trim()
    if (!normalizedTitle) {
      setError('Укажите название компании')
      return
    }

    setLoading(true)
    setError('')
    try {
      const [createResponse, profileResponse] = await Promise.all([
        fetch('/api/party/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: normalizedTitle }),
        }),
        fetch('/api/party/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastWorkspace: 'company' }),
        }),
      ])

      const createPayload = await createResponse.json().catch(() => ({}))
      await profileResponse.json().catch(() => ({}))

      if (!createResponse.ok || createPayload?.success === false) {
        setError(
          createPayload?.error?.message ||
            createPayload?.error ||
            'Не удалось создать компанию'
        )
        return
      }

      window.dispatchEvent(new Event('partycrm:profile-updated'))
      window.location.replace('/company')
    } catch (submitError) {
      setError('Не удалось завершить настройку компании')
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
          Создайте первую компанию
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
          После этого вы сразу попадете в кабинет компании и сможете добавлять
          сотрудников, площадки, клиентов и заказы.
        </p>

        {error ? (
          <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-8 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-slate-700">Название компании</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-md border border-sky-100 px-3 outline-none focus:border-sky-500"
              placeholder="Например, Агентство Праздник"
            />
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}
            >
              {loading ? 'Создаем...' : 'Создать компанию'}
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
