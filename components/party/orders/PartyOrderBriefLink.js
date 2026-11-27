'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyOrderPublicLink, { partyOrderSecondaryButton } from './PartyOrderPublicLink'

export default function PartyOrderBriefLink({
  companyId,
  orderId,
  canCreate,
  disabled,
  onOrderRefreshed,
}) {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const action = useRef(null)
  const orderEndpoint = `/api/party/orders/${encodeURIComponent(orderId)}`
  const endpoint = `${orderEndpoint}/brief-link`

  useEffect(() => {
    const controller = new AbortController()
    apiJson(endpoint, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setLink(data)
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || 'Не удалось загрузить ссылку на бриф.')
    })
    return () => {
      controller.abort()
      action.current?.abort()
      action.current = null
    }
  }, [companyId, endpoint])

  const request = async (method) => {
    if (action.current) return
    const controller = new AbortController()
    action.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const options = {
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
        signal: controller.signal,
      }
      const { data } = await apiJson(endpoint, { ...options, method })
      if (controller.signal.aborted) return
      setLink(data)
      if (method === 'GET' && data.submittedAt && onOrderRefreshed) {
        const result = await apiJson(orderEndpoint, options)
        if (controller.signal.aborted) return
        if (!result.data) throw new Error('Не удалось загрузить ответы в карточку заказа.')
        onOrderRefreshed(result.data)
        setNotice('Ответы клиента добавлены в бриф заказа.')
      } else if (method === 'GET' && data.path && !data.submittedAt) {
        setNotice('Клиент пока не отправил бриф.')
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || 'Не удалось обновить бриф клиента.')
    } finally {
      if (action.current === controller) {
        action.current = null
        setBusy(false)
      }
    }
  }

  if (!canCreate && !link?.createdAt) return null

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Бриф для клиента</h3>
        <p className="mt-1 text-sm text-slate-700" role="status">
          {link?.submittedAt
            ? 'Клиент заполнил бриф.'
            : link?.createdAt
              ? 'Ожидаем ответы клиента.'
              : link
                ? 'Отправьте клиенту ссылку. Его ответы появятся в брифе заказа.'
                : error
                  ? ''
                  : 'Загружаем ссылку…'}
        </p>
      </div>
      {error ? <p className="text-sm text-red-800" role="alert">{error}</p> : null}
      {link?.path && canCreate ? (
        <PartyOrderPublicLink key={link.path} path={link.path} label="Ссылка на бриф для клиента" openLabel="Открыть бриф" />
      ) : null}
      {link && !link.createdAt && canCreate ? (
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || busy}
          onClick={() => request('POST')}
        >
          {busy ? 'Создаём ссылку…' : 'Создать ссылку на бриф'}
        </button>
      ) : null}
      {((link?.createdAt && onOrderRefreshed) || (!link && error)) ? (
        <button type="button" className={partyOrderSecondaryButton} disabled={disabled || busy} onClick={() => request('GET')}>
          {busy ? 'Проверяем…' : link ? 'Проверить ответы' : 'Повторить загрузку'}
        </button>
      ) : null}
      {notice ? <p className="text-sm text-slate-700" role="status">{notice}</p> : null}
    </section>
  )
}
