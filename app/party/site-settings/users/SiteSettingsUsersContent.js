'use client'

import { apiJson } from '@helpers/apiClient'
import {
  getPartyUserDisplayName,
  getPartyUserRoleLabel,
} from '@helpers/partySiteSettingsViewModel'
import { useEffect, useMemo, useState } from 'react'

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

  useEffect(() => {
    apiJson('/api/party/site-settings/users', { cache: 'no-store' })
      .then((payload) => setUsers(Array.isArray(payload?.data) ? payload.data : []))
      .catch((err) => setError(err?.message || 'Не удалось загрузить пользователей'))
      .finally(() => setLoading(false))
  }, [])

  const activeUsersCount = useMemo(
    () => users.filter((user) => user.status === 'active').length,
    [users]
  )

  return (
    <section className="rounded-2xl border border-sky-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 p-5">
        <div>
          <div className="text-base font-semibold">Пользователи</div>
          <p className="mt-1 text-sm text-slate-500">
            Глобальный список аккаунтов PartyCRM без паролей и приватных токенов.
          </p>
        </div>
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
          {activeUsersCount} активных из {users.length}
        </div>
      </div>
      {loading ? (
        <div className="p-5 text-sm text-slate-500">Загружаем пользователей...</div>
      ) : error ? (
        <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
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
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {getPartyUserDisplayName(user)}
                  </td>
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
    </section>
  )
}
