'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { TicketError } from './TicketingControls'
import { ticketButton, ticketCard, ticketDate } from './ticketingUi'

export default function FocusedTicketSession({
  companyId,
  sessionId,
  revision,
  onChoose,
  canEdit,
}) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const key = `${companyId}:${sessionId}:${revision}:${retry}`
  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    apiJson(
      `/api/party/ticketing?section=session&id=${encodeURIComponent(sessionId)}`,
      {
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key, data: result.data, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            error: cause.message || 'Не удалось открыть сеанс',
          })
      })
    return () => controller.abort()
  }, [companyId, key, sessionId])
  if (!sessionId) return null
  const current = state.key === key ? state : null
  return (
    <article
      className={ticketCard + ' space-y-2 border-sky-400'}
      aria-label="Сеанс из календаря"
    >
      <p className="text-xs font-semibold text-sky-700">Сеанс из календаря</p>
      {!current ? (
        <p role="status">Загрузка сеанса…</p>
      ) : current.error ? (
        <>
          <TicketError>{current.error}</TicketError>
          <button
            className={ticketButton}
            onClick={() => setRetry((value) => value + 1)}
            type="button"
          >
            Повторить загрузку сеанса
          </button>
        </>
      ) : (
        <>
          <h3 className="font-semibold text-sky-950">
            {current.data.title || 'Билетный сеанс'}
          </h3>
          <p className="text-sm">
            {ticketDate(current.data.startsAt)} —{' '}
            {ticketDate(current.data.endsAt)}
          </p>
          <p className="text-sm">
            {
              {
                scheduled: 'Запланирован',
                canceled: 'Отменён',
                completed: 'Проведён',
              }[current.data.status]
            }
          </p>
          {canEdit ? (
            <button
              type="button"
              className={ticketButton}
              onClick={() => onChoose(current.data)}
            >
              Изменить этот сеанс
            </button>
          ) : null}
        </>
      )}
    </article>
  )
}
