'use client'

import { apiJson } from '@helpers/apiClient'
import {
  notifyPartyImpersonationChange,
  setPartyImpersonationSwitching,
} from '@helpers/partyImpersonationClient'
import { PARTY_IMPERSONATION_API_PATH } from '@helpers/partyImpersonationConstants'
import {
  getPartyUserDisplayName,
  getPartyUserRoleLabel,
} from '@helpers/partySiteSettingsViewModel'
import { useEffect, useState } from 'react'

const PAGE_SIZE = 50
const controlClassName =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-50'

const formatDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const getInterfaceRolesLabel = (roles) => {
  if (!Array.isArray(roles) || roles.length === 0) return '-'
  return roles
    .map((role) => (role === 'company' ? 'Компания' : 'Исполнитель'))
    .join(', ')
}

export default function SiteSettingsUsersContent() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [viewerId, setViewerId] = useState('')
  const [openingUserId, setOpeningUserId] = useState('')
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      q: query,
    })
    apiJson(`/api/party/site-settings/users?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((payload) => {
        if (controller.signal.aborted) return
        setUsers(Array.isArray(payload?.data) ? payload.data : [])
        setPagination(payload?.pagination || null)
        setViewerId(payload?.viewerId || '')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err?.message || 'Не удалось загрузить пользователей')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, query])

  const total = pagination?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const loadPage = (nextPage, nextQuery = query) => {
    if (nextPage === page && nextQuery === query) return
    setLoading(true)
    setError('')
    setActionError(null)
    setPage(nextPage)
    setQuery(nextQuery)
  }

  const openCabinet = async (user) => {
    setOpeningUserId(user._id)
    setActionError(null)
    setPartyImpersonationSwitching(true)
    try {
      await apiJson(PARTY_IMPERSONATION_API_PATH, {
        method: 'POST',
        body: JSON.stringify({ userId: user._id }),
      })
    } catch (err) {
      setPartyImpersonationSwitching(false)
      setActionError({
        userId: user._id,
        message: err?.message || 'Не удалось открыть кабинет пользователя',
      })
      setOpeningUserId('')
      return
    }
    notifyPartyImpersonationChange()
    window.location.replace('/party/entry')
  }

  return (
    <section className="min-w-0 rounded-2xl border border-sky-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 p-5">
        <div>
          <div className="text-base font-semibold">Пользователи</div>
          <p className="mt-1 text-sm text-slate-500">
            Глобальный список аккаунтов PartyCRM без паролей и приватных токенов.
          </p>
        </div>
        {!loading && !error && pagination ? (
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
            {pagination.active} активных из {total}
          </div>
        ) : null}
      </div>
      <form
        className="flex flex-wrap items-end gap-2 border-b border-sky-100 px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault()
          loadPage(1, search.trim())
        }}
      >
        <label className="grid min-w-0 grow basis-full gap-1 text-sm font-medium text-slate-700 sm:basis-56">
          Поиск пользователей
          <input
            type="search"
            value={search}
            maxLength={200}
            placeholder="Имя, телефон или почта"
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-11 min-w-0 rounded-lg border border-sky-200 px-3 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          />
        </label>
        <button type="submit" className={controlClassName} disabled={Boolean(openingUserId)}>
          Найти
        </button>
      </form>
      {loading ? (
        <div role="status" className="p-5 text-sm text-slate-500">
          Загружаем пользователей...
        </div>
      ) : error ? (
        <div role="alert" className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : users.length === 0 ? (
        <div className="p-5 text-sm text-slate-500">Пользователи не найдены.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Пользователь</th>
                <th className="px-5 py-3 font-semibold">Контакты</th>
                <th className="px-5 py-3 font-semibold">Роль</th>
                <th className="px-5 py-3 font-semibold">Интерфейсы</th>
                <th className="px-5 py-3 font-semibold">Статус</th>
                <th className="px-5 py-3 font-semibold">Создан</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user._id} className="align-top">
                  <th scope="row" className="px-5 py-4 text-left font-semibold text-slate-900">
                    <div className="max-w-44 break-words">{getPartyUserDisplayName(user)}</div>
                    {viewerId && user._id !== viewerId && user.status === 'active' ? (
                      <button
                        type="button"
                        className={`${controlClassName} mt-2 whitespace-nowrap`}
                        aria-label={
                          openingUserId === user._id
                            ? 'Открываем кабинет'
                            : `Открыть кабинет пользователя ${getPartyUserDisplayName(user)}`
                        }
                        aria-busy={openingUserId === user._id}
                        disabled={Boolean(openingUserId)}
                        onClick={() => openCabinet(user)}
                      >
                        {openingUserId === user._id ? 'Открываем…' : 'Открыть кабинет'}
                      </button>
                    ) : null}
                    {actionError?.userId === user._id ? (
                      <p role="alert" className="mt-2 max-w-44 text-xs font-medium text-red-700">
                        {actionError.message}
                      </p>
                    ) : null}
                  </th>
                  <td className="px-5 py-4 text-slate-600">
                    <div>{user.phone || '-'}</div>
                    <div className="text-xs text-slate-400">{user.email || '-'}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {getPartyUserRoleLabel(user.role)}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {getInterfaceRolesLabel(user.interfaceRoles)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {user.status || '-'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {formatDate(user.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && totalPages > 1 ? (
        <nav
          aria-label="Страницы списка пользователей"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 px-5 py-4"
        >
          <span className="text-sm tabular-nums text-slate-600">
            Страница {page} из {totalPages}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={controlClassName}
              disabled={page <= 1 || Boolean(openingUserId)}
              onClick={() => loadPage(page - 1)}
            >
              Назад
            </button>
            <button
              type="button"
              className={controlClassName}
              disabled={page >= totalPages || Boolean(openingUserId)}
              onClick={() => loadPage(page + 1)}
            >
              Далее
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  )
}
