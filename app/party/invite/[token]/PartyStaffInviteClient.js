'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const statusMessages = {
  accepted: 'Это приглашение уже использовано.',
  revoked: 'Приглашение отменено администратором компании.',
  expired: 'Срок действия приглашения истёк.',
  invalid: 'Приглашение недействительно.',
}

export default function PartyStaffInviteClient({ token }) {
  const [invite, setInvite] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')

  const invitePath = useMemo(
    () => `/party/invite/${encodeURIComponent(token)}`,
    [token]
  )
  const callbackParam = encodeURIComponent(invitePath)

  useEffect(() => {
    let active = true
    Promise.all([
      apiJson(`/api/party/invites/${encodeURIComponent(token)}`, {
        cache: 'no-store',
      }),
      fetch('/api/party/auth/me', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ])
      .then(([inviteResponse, authResponse]) => {
        if (!active) return
        setInvite(inviteResponse.data ?? null)
        setUser(authResponse?.data?.user ?? null)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Приглашение не найдено')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const acceptInvite = async () => {
    setAccepting(true)
    setError('')
    try {
      const response = await apiJson(
        `/api/party/invites/${encodeURIComponent(token)}/accept`,
        { method: 'POST' }
      )
      window.location.replace(response.data?.redirectTo || '/party/entry')
    } catch (requestError) {
      setError(requestError.message || 'Не удалось принять приглашение')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#eaf6ff] px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-xl rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-sky-700">PartyCRM</p>
        <h1 className="mt-2 text-2xl font-semibold">Приглашение в компанию</h1>

        {loading ? <p className="mt-5 text-slate-500">Загрузка...</p> : null}
        {error ? (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && invite ? (
          <div className="mt-5 grid gap-4">
            <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="text-lg font-semibold">{invite.companyTitle}</div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Сотрудник</dt>
                  <dd className="font-semibold text-right">{invite.staffName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Роль</dt>
                  <dd className="font-semibold">{invite.roleLabel}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Телефон</dt>
                  <dd className="font-semibold">{invite.maskedPhone}</dd>
                </div>
              </dl>
            </div>

            {invite.status !== 'active' ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {statusMessages[invite.status] || statusMessages.invalid}
              </p>
            ) : !user ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  href={`/party/login?callbackUrl=${callbackParam}`}
                  className="rounded-md bg-sky-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Войти
                </Link>
                <Link
                  href={`/party/login?mode=register&callbackUrl=${callbackParam}`}
                  className="rounded-md border border-sky-200 bg-white px-4 py-2 text-center text-sm font-semibold text-sky-700 hover:bg-sky-50"
                >
                  Зарегистрироваться
                </Link>
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-sm leading-6 text-slate-600">
                  Вы вошли как {user.phone}. Подключение будет выполнено только
                  после подтверждения. Телефон аккаунта должен совпадать с
                  телефоном приглашения.
                </p>
                <button
                  type="button"
                  disabled={accepting}
                  onClick={acceptInvite}
                  className="cursor-pointer rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {accepting ? 'Подключаем...' : 'Принять приглашение'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}
