'use client'

import { useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const statusLabels = {
  active: 'Приглашение активно',
  accepted: 'Приглашение принято',
  revoked: 'Приглашение отменено',
  expired: 'Срок приглашения истёк',
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru-RU')
}

export default function PartyStaffInvitePanel({ staffId, activeCompanyId }) {
  const [open, setOpen] = useState(false)
  const [invite, setInvite] = useState(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [share, setShare] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const requestOptions = (options = {}) => ({
    ...options,
    headers: {
      ...(options.headers ?? {}),
      'x-partycrm-company-id': activeCompanyId,
    },
  })

  const toggle = async (event) => {
    event.stopPropagation()
    setCopied('')
    if (open) {
      setOpen(false)
      return
    }

    setOpen(true)
    if (!inviteUrl) await createInvite(event)
  }

  const createInvite = async (event) => {
    event.stopPropagation()
    setLoading(true)
    setError('')
    setCopied('')
    try {
      const response = await apiJson(
        `/api/party/staff/${staffId}/invite`,
        requestOptions({ method: 'POST' })
      )
      setInvite(response.data ?? null)
      setInviteUrl(response.data?.inviteUrl || '')
      setShare(response.data?.share ?? null)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось создать приглашение')
    } finally {
      setLoading(false)
    }
  }

  const revokeInvite = async (event) => {
    event.stopPropagation()
    setLoading(true)
    setError('')
    try {
      await apiJson(
        `/api/party/staff/${staffId}/invite`,
        requestOptions({ method: 'DELETE' })
      )
      setInvite((current) =>
        current ? { ...current, status: 'revoked' } : current
      )
      setInviteUrl('')
      setShare(null)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось отменить приглашение')
    } finally {
      setLoading(false)
    }
  }

  const copyValue = async (event, value, type) => {
    event.stopPropagation()
    if (!value) return
    setError('')
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Буфер обмена недоступен')
      }
      await navigator.clipboard.writeText(value)
      setCopied(type)
    } catch (copyError) {
      setError(copyError.message || 'Не удалось скопировать приглашение')
    }
  }

  return (
    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className="cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? 'Создаём приглашение...'
          : open
            ? 'Скрыть приглашение'
            : 'Пригласить в систему'}
      </button>

      {open ? (
        <div className="mt-2 grid gap-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-sm">
          {loading ? <p className="text-slate-500">Загрузка...</p> : null}
          {error ? <p className="text-red-600">{error}</p> : null}
          {!loading && invite ? (
            <div className="grid gap-1 text-slate-600">
              <span className="font-semibold text-slate-800">
                {statusLabels[invite.status] || invite.status}
              </span>
              {invite.expiresAt ? (
                <span>Действует до: {formatDateTime(invite.expiresAt)}</span>
              ) : null}
            </div>
          ) : null}

          {inviteUrl ? (
            <div className="grid gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full rounded-md border border-sky-100 bg-white px-2 py-2 text-xs text-slate-700"
              />
              <button
                type="button"
                onClick={(event) => copyValue(event, inviteUrl, 'link')}
                className="w-fit cursor-pointer rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
              >
                {copied === 'link' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              {share?.text ? (
                <button
                  type="button"
                  onClick={(event) => copyValue(event, share.text, 'text')}
                  className="w-fit cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  {copied === 'text'
                    ? 'Текст скопирован'
                    : 'Скопировать текст приглашения'}
                </button>
              ) : null}
              {share ? (
                <div className="flex flex-wrap gap-2">
                  <a href={share.smsUrl} className="text-xs font-semibold text-sky-700 underline">
                    SMS
                  </a>
                  <a href={share.emailUrl} className="text-xs font-semibold text-sky-700 underline">
                    Email
                  </a>
                  <a
                    href={share.telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-sky-700 underline"
                  >
                    Telegram
                  </a>
                  <a
                    href={share.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-sky-700 underline"
                  >
                    WhatsApp
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {invite?.status === 'active' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={createInvite}
                className="cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
              >
                Перевыпустить
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={revokeInvite}
                className="cursor-pointer rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Отменить
              </button>
            </div>
          ) : null}
          {!inviteUrl && invite?.status === 'active' ? (
            <p className="text-xs text-slate-500">
              Открытая ссылка показывается только сразу после выпуска. При
              необходимости перевыпустите приглашение.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
