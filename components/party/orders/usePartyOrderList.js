'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const empty = []
const emptyState = {
  key: '',
  orders: empty,
  nextCursor: null,
  busy: false,
  busyMore: false,
  error: '',
  errorMore: '',
}
const MAX_EMPTY_PAGES = 3
const invalidPage = () =>
  new Error(
    'Не удалось получить следующую страницу заказов. Повторите загрузку.'
  )

export default function usePartyOrderList({
  companyId,
  enabled,
  accessKey,
  search = '',
  stageId = '',
  quick = 'all',
  todayFrom = '',
  todayTo = '',
  refreshKey = 0,
}) {
  const querySearch = search.trim()
  const [settledSearch, setSettledSearch] = useState(querySearch)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState(emptyState)
  const generation = useRef(0)
  const flight = useRef(null)
  const waiting = settledSearch !== querySearch
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setSettledSearch(querySearch), 250)
    return () => clearTimeout(timer)
  }, [querySearch, waiting])
  const params = new URLSearchParams({ view: 'list', quick })
  if (querySearch) params.set('q', querySearch)
  if (stageId) params.set('stageId', stageId)
  if (quick === 'today') {
    params.set('todayFrom', todayFrom)
    params.set('todayTo', todayTo)
  }
  const query = params.toString()
  const key = JSON.stringify([companyId, accessKey, query, refreshKey, retry])
  const loadPage = useCallback(
    async ({ cursor, orders, current, controller, more }) => {
      const records = new Map(orders.map((order) => [String(order._id), order]))
      let nextCursor = cursor
      let emptyPages = 0
      try {
        do {
          const pageParams = new URLSearchParams(query)
          if (nextCursor) pageParams.set('listCursor', nextCursor)
          const result = await apiJson(`/api/party/orders?${pageParams}`, {
            headers: { 'x-partycrm-company-id': companyId },
            cache: 'no-store',
            signal: controller.signal,
          })
          if (current !== generation.current) return
          const next = result?.meta?.nextCursor
          if (
            !Array.isArray(result?.data) ||
            (next !== null &&
              (typeof next !== 'string' || !/^[a-f\d]{24}$/i.test(next))) ||
            typeof result?.meta?.hasMore !== 'boolean' ||
            result.meta.hasMore !== Boolean(next) ||
            (next &&
              nextCursor &&
              next.toLowerCase() >= nextCursor.toLowerCase())
          )
            throw invalidPage()
          for (const order of result.data) records.set(String(order._id), order)
          nextCursor = next
          emptyPages = result.data.length ? 0 : emptyPages + 1
          // Task visibility may need bounded server scans with zero matches.
          // Pause after a small budget so the user controls further scanning.
          if (result.data.length) break
        } while (nextCursor && emptyPages < MAX_EMPTY_PAGES)
        setState({
          key,
          orders: [...records.values()],
          nextCursor,
          busy: false,
          busyMore: false,
          error: '',
          errorMore: '',
        })
      } catch (cause) {
        if (current !== generation.current || cause.name === 'AbortError')
          return
        setState({
          key,
          orders,
          nextCursor: cursor,
          busy: false,
          busyMore: false,
          error: more ? '' : cause.message || 'Не удалось загрузить заказы',
          errorMore: more
            ? cause.message || 'Не удалось загрузить ещё заказы'
            : '',
        })
      } finally {
        if (current === generation.current) flight.current.running = false
      }
    },
    [companyId, key, query]
  )
  useEffect(() => {
    const current = ++generation.current
    if (!enabled || waiting) return
    const controller = new AbortController()
    flight.current = { current, controller, running: true }
    setState({ ...emptyState, key, busy: true })
    loadPage({ cursor: null, orders: empty, current, controller, more: false })
    return () => {
      if (current === generation.current) {
        generation.current += 1
        flight.current?.controller.abort()
      }
    }
  }, [enabled, key, waiting, loadPage])
  const loadMore = useCallback(() => {
    if (
      !enabled ||
      waiting ||
      state.key !== key ||
      !state.nextCursor ||
      flight.current?.running
    )
      return
    const current = generation.current
    const controller = new AbortController()
    flight.current = { current, controller, running: true }
    setState((previous) => ({ ...previous, busyMore: true, errorMore: '' }))
    loadPage({
      cursor: state.nextCursor,
      orders: state.orders,
      current,
      controller,
      more: true,
    })
  }, [enabled, waiting, state, key, loadPage])
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  const current = enabled && !waiting && state.key === key
  return {
    orders: current ? state.orders : empty,
    nextCursor: current ? state.nextCursor : null,
    busy: enabled && (waiting || !current || state.busy),
    busyMore: current && state.busyMore,
    error: current ? state.error : '',
    errorMore: current ? state.errorMore : '',
    loadMore,
    reload,
  }
}
