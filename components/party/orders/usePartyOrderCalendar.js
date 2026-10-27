'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { getPartyRoleCalendarRange } from '@helpers/partyRoleCalendar'
import { buildPartyOrderCalendarGrid } from './partyOrderCalendarViewModel'

const empty = []

export default function usePartyOrderCalendar({
  companyId,
  enabled,
  month,
  accessKey,
  refreshKey,
}) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    key: '',
    orders: empty,
    busy: false,
    error: '',
  })
  const generation = useRef(0)
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`
  const key = `${companyId}:${accessKey}:${monthKey}:${refreshKey}:${retry}`
  const range = getPartyRoleCalendarRange(buildPartyOrderCalendarGrid(month))
  const dateFrom = range.dateFrom
  const dateTo = range.dateTo
  useEffect(() => {
    if (!enabled) return
    const current = ++generation.current
    const controller = new AbortController()
    const load = async () => {
      setState({ key, orders: empty, busy: true, error: '' })
      try {
        const records = new Map()
        const cursors = new Set()
        let cursor = ''
        do {
          const query = new URLSearchParams({ dateFrom, dateTo })
          if (cursor) query.set('calendarCursor', cursor)
          const result = await apiJson(`/api/party/orders?${query}`, {
            headers: { 'x-partycrm-company-id': companyId },
            cache: 'no-store',
            signal: controller.signal,
          })
          if (current !== generation.current) return
          if (
            !Array.isArray(result?.data) ||
            !result.meta ||
            !Object.hasOwn(result.meta, 'nextCursor')
          )
            throw new Error(
              'Не удалось получить полный календарь. Обновите страницу и повторите загрузку.'
            )
          for (const order of result.data || [])
            records.set(String(order._id), order)
          cursor = result.meta?.nextCursor || ''
          if (cursor && !/^[a-f\d]{24}$/i.test(cursor))
            throw new Error('Не удалось получить весь календарь. Обновите его.')
          if (cursor && cursors.has(cursor))
            throw new Error('Не удалось получить весь календарь. Обновите его.')
          if (cursor) cursors.add(cursor)
        } while (cursor)
        setState({ key, orders: [...records.values()], busy: false, error: '' })
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
  }, [companyId, dateFrom, dateTo, enabled, key])
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  return {
    orders: state.key === key ? state.orders : empty,
    busy: enabled && (state.key !== key || state.busy),
    error: state.key === key ? state.error : '',
    reload,
  }
}
