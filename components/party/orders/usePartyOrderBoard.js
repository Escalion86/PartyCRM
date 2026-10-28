'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const blankColumn = () => ({
  orders: [],
  nextCursor: null,
  busy: true,
  busyMore: false,
  error: '',
  errorMore: '',
})
const invalidPage = () =>
  new Error(
    'Не удалось получить полную страницу доски заказов. Повторите загрузку.'
  )

export default function usePartyOrderBoard({
  companyId,
  enabled,
  accessKey,
  stageIds,
  search = '',
  quick = 'all',
  todayFrom = '',
  todayTo = '',
  refreshKey = 0,
}) {
  const querySearch = search.trim()
  const [settledSearch, setSettledSearch] = useState(querySearch)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({ key: '', columns: {} })
  const generation = useRef(0)
  const flights = useRef(new Map())
  const waiting = settledSearch !== querySearch
  const stageKey = JSON.stringify(stageIds)
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setSettledSearch(querySearch), 250)
    return () => clearTimeout(timer)
  }, [querySearch, waiting])
  const params = new URLSearchParams({ view: 'list', quick })
  if (querySearch) params.set('q', querySearch)
  if (quick === 'today') {
    params.set('todayFrom', todayFrom)
    params.set('todayTo', todayTo)
  }
  const query = params.toString()
  const key = JSON.stringify([
    companyId,
    accessKey,
    stageKey,
    query,
    refreshKey,
    retry,
  ])
  const loadPage = useCallback(
    async ({
      stageId,
      cursor = null,
      orders = [],
      current,
      controller,
      more = false,
    }) => {
      const records = new Map(orders.map((order) => [String(order._id), order]))
      let nextCursor = cursor
      let emptyPages = 0
      try {
        do {
          const pageParams = new URLSearchParams(query)
          pageParams.set('stageId', stageId)
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
          if (result.data.length) break
        } while (nextCursor && emptyPages < 3)
        if (current !== generation.current) return
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                columns: {
                  ...previous.columns,
                  [stageId]: {
                    orders: [...records.values()],
                    nextCursor,
                    busy: false,
                    busyMore: false,
                    error: '',
                    errorMore: '',
                  },
                },
              }
            : previous
        )
      } catch (cause) {
        if (current !== generation.current || cause.name === 'AbortError')
          return
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                columns: {
                  ...previous.columns,
                  [stageId]: {
                    orders,
                    nextCursor: cursor,
                    busy: false,
                    busyMore: false,
                    error: more
                      ? ''
                      : cause.message || 'Не удалось загрузить этап',
                    errorMore: more
                      ? cause.message || 'Не удалось загрузить ещё заказы'
                      : '',
                  },
                },
              }
            : previous
        )
      } finally {
        if (current === generation.current) flights.current.delete(stageId)
      }
    },
    [companyId, key, query]
  )
  useEffect(() => {
    const current = ++generation.current
    if (!enabled || waiting) return
    const activeFlights = flights.current
    const stages = JSON.parse(stageKey)
    const controller = new AbortController()
    setState({
      key,
      columns: Object.fromEntries(stages.map((id) => [id, blankColumn()])),
    })
    let index = 0
    const worker = async () => {
      while (index < stages.length && current === generation.current) {
        const stageId = stages[index++]
        flights.current.set(stageId, controller)
        await loadPage({ stageId, current, controller })
      }
    }
    Promise.all(Array.from({ length: Math.min(4, stages.length) }, worker))
    return () => {
      if (current === generation.current) generation.current += 1
      controller.abort()
      for (const flight of activeFlights.values()) flight.abort()
      activeFlights.clear()
    }
  }, [enabled, waiting, key, stageKey, loadPage])
  const loadMore = useCallback(
    (stageId) => {
      const column = state.columns[stageId]
      if (
        !enabled ||
        waiting ||
        state.key !== key ||
        !column?.nextCursor ||
        flights.current.has(stageId)
      )
        return
      const current = generation.current
      const controller = new AbortController()
      flights.current.set(stageId, controller)
      setState((previous) => ({
        ...previous,
        columns: {
          ...previous.columns,
          [stageId]: { ...column, busyMore: true, errorMore: '' },
        },
      }))
      loadPage({
        stageId,
        cursor: column.nextCursor,
        orders: column.orders,
        current,
        controller,
        more: true,
      })
    },
    [enabled, waiting, state, key, loadPage]
  )
  const reload = useCallback(() => setRetry((value) => value + 1), [])
  const current = enabled && !waiting && state.key === key
  return {
    columns: current ? state.columns : {},
    busy:
      enabled &&
      (waiting ||
        !current ||
        Object.values(state.columns).some(
          (column) => column.busy || column.busyMore
        )),
    reload,
    loadMore,
  }
}
