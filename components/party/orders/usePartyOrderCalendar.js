'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { getPartyRoleCalendarRange } from '@helpers/partyRoleCalendar'
import { buildPartyOrderCalendarPeriod } from './partyOrderCalendarViewModel'

const empty = []

export default function usePartyOrderCalendar({
  companyId,
  enabled,
  month,
  accessKey,
  refreshKey,
  ticketsEnabled = false,
  view = 'month',
}) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    key: '',
    orders: empty,
    busy: false,
    error: '',
  })
  const generation = useRef(0)
  const range = getPartyRoleCalendarRange(
    buildPartyOrderCalendarPeriod(month, view)
  )
  const key = `${companyId}:${accessKey}:${view}:${range.dateFrom}:${range.dateTo}:${refreshKey}:${retry}:${ticketsEnabled}`
  const dateFrom = range.dateFrom
  const dateTo = range.dateTo
  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    const controller = new AbortController()
    const load = async () => {
      setState({ key, orders: empty, busy: true, error: '' })
      try {
        const loadPages = async (tickets) => {
          const records = new Map(),
            cursors = new Set()
          let cursor = ''
          do {
            const query = new URLSearchParams(
              tickets
                ? { section: 'sessions', from: dateFrom, to: dateTo }
                : { dateFrom, dateTo }
            )
            if (cursor) query.set(tickets ? 'cursor' : 'calendarCursor', cursor)
            const result = await apiJson(
              `/api/party/${tickets ? 'ticketing' : 'orders'}?${query}`,
              {
                headers: { 'x-partycrm-company-id': companyId },
                cache: 'no-store',
                signal: controller.signal,
              }
            )
            if (current !== generation.current) return
            if (
              !Array.isArray(result?.data) ||
              !result.meta ||
              !Object.hasOwn(result.meta, 'nextCursor')
            )
              throw new Error(
                'Не удалось получить полный календарь. Обновите страницу и повторите загрузку.'
              )
            for (const row of result.data || []) {
              const order = tickets
                ? {
                    _id: `ticket-session:${row._id}`,
                    ticketSessionId: row._id,
                    calendarEntityType: 'ticket_session',
                    title: row.title,
                    eventDate: row.startsAt,
                    dateEnd: row.endsAt,
                    locationId: row.locationId,
                    status: {
                      scheduled: 'active',
                      completed: 'closed',
                      canceled: 'canceled',
                    }[row.status],
                  }
                : row
              records.set(String(order._id), order)
            }
            cursor = result.meta?.nextCursor || ''
            if (cursor && !/^[a-f\d]{24}$/i.test(cursor))
              throw new Error(
                'Не удалось получить весь календарь. Обновите его.'
              )
            if (
              cursor &&
              (cursors.has(cursor) ||
                (cursors.size &&
                  (tickets
                    ? cursor.toLowerCase() >= [...cursors].at(-1).toLowerCase()
                    : cursor.toLowerCase() <=
                      [...cursors].at(-1).toLowerCase())))
            )
              throw new Error(
                'Не удалось получить весь календарь. Обновите его.'
              )
            if (cursor) cursors.add(cursor)
          } while (cursor)
          return [...records.values()]
        }
        const [orders, sessions] = await Promise.all([
          loadPages(false),
          ticketsEnabled ? loadPages(true) : [],
        ])
        if (current !== generation.current) return
        setState({
          key,
          orders: [...orders, ...sessions],
          busy: false,
          error: '',
        })
      } catch (cause) {
        if (current === generation.current && cause.name !== 'AbortError')
          setState({
            key,
            orders: empty,
            busy: false,
            error: cause.message || 'Не удалось загрузить календарь',
          })
      }
    }
    load()
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, dateFrom, dateTo, enabled, key, ticketsEnabled])
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  return {
    orders: state.key === key ? state.orders : empty,
    busy: enabled && (state.key !== key || state.busy),
    error: state.key === key ? state.error : '',
    reload,
  }
}
