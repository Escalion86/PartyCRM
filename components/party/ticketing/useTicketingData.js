'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const empty = []
export function useTicketingCatalog(companyId) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({
    key: '',
    companyId,
    data: null,
    error: '',
  })
  const key = `${companyId}:${revision}`
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    apiJson('/api/party/ticketing?section=catalog', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (current === generation.current)
          setState({ key, companyId, data: result.data, error: '' })
      })
      .catch((cause) => {
        if (current === generation.current && cause.name !== 'AbortError')
          setState((previous) => ({
            data:
              [401, 403].includes(cause.status) && previous.data
                ? {
                    ...previous.data,
                    enabled: false,
                    capabilities: { read: false },
                  }
                : previous.data,
            key,
            companyId,
            error: cause.message || 'Не удалось загрузить билеты и посещения',
          }))
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, key])
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  return {
    data: state.companyId === companyId ? state.data : null,
    busy: state.key !== key,
    error: state.key === key ? state.error : '',
    reload,
    revision,
  }
}

export function useTicketingList({
  companyId,
  section,
  enabled,
  filters = '',
  revision = 0,
}) {
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState({
    key: '',
    rows: empty,
    nextCursor: null,
    busy: false,
    error: '',
  })
  const generation = useRef(0)
  const flight = useRef(null)
  const key = JSON.stringify([companyId, section, filters, revision, retry])
  const load = useCallback(
    async (cursor, rows, current, controller) => {
      try {
        const params = new URLSearchParams(filters)
        params.set('section', section)
        if (cursor) params.set('cursor', cursor)
        const result = await apiJson(`/api/party/ticketing?${params}`, {
          headers: { 'x-partycrm-company-id': companyId },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (current !== generation.current) return
        const next = result.meta?.nextCursor
        if (
          !Array.isArray(result.data) ||
          (next !== null &&
            (typeof next !== 'string' || !/^[a-f\d]{24}$/i.test(next))) ||
          (next && cursor && next.toLowerCase() >= cursor.toLowerCase())
        )
          throw new Error(
            'Не удалось получить следующую страницу. Повторите загрузку.'
          )
        const records = new Map(rows.map((row) => [String(row._id), row]))
        for (const row of result.data) records.set(String(row._id), row)
        setState({
          key,
          rows: [...records.values()],
          nextCursor: next,
          busy: false,
          error: '',
        })
      } catch (cause) {
        if (current === generation.current && cause.name !== 'AbortError')
          setState({
            key,
            rows,
            nextCursor: cursor,
            busy: false,
            error: cause.message || 'Не удалось загрузить записи',
          })
      } finally {
        if (current === generation.current) flight.current.running = false
      }
    },
    [companyId, section, filters, key]
  )
  useEffect(() => {
    const current = ++generation.current
    if (!enabled) return
    const controller = new AbortController()
    flight.current = { controller, running: true }
    load(null, empty, current, controller)
    return () => {
      generation.current += 1
      flight.current?.controller.abort()
    }
  }, [enabled, key, load])
  const more = () => {
    if (
      !enabled ||
      state.key !== key ||
      !state.nextCursor ||
      flight.current?.running
    )
      return
    const controller = new AbortController()
    flight.current = { controller, running: true }
    setState((previous) => ({ ...previous, busy: true, error: '' }))
    load(state.nextCursor, state.rows, generation.current, controller)
  }
  const reload = () => setRetry((value) => value + 1)
  const current = enabled && state.key === key
  return {
    rows: current ? state.rows : empty,
    nextCursor: current ? state.nextCursor : null,
    busy: enabled && (!current || state.busy),
    error: current ? state.error : '',
    more,
    reload,
  }
}

export function useTicketingCommand(companyId) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const flight = useRef(false)
  const attempt = useRef(null)
  const run = async (action, payload) => {
    if (flight.current) return null
    const fingerprint = JSON.stringify({ action, payload })
    if (!attempt.current || attempt.current.fingerprint !== fingerprint)
      attempt.current = {
        fingerprint,
        requestKey:
          globalThis.crypto?.randomUUID?.() ||
          `ticket-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }
    flight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await apiJson('/api/party/ticketing', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({
          action,
          payload,
          requestKey: attempt.current.requestKey,
        }),
      })
      attempt.current = null
      setUncertain(false)
      return result
    } catch (cause) {
      const unknown = !cause.status || cause.status >= 500
      setUncertain(unknown)
      setError(
        (unknown
          ? 'Подтверждение не получено. Повторите сохранение с теми же данными — дубликат не создастся. '
          : '') + (cause.message || 'Не удалось сохранить')
      )
      return null
    } finally {
      flight.current = false
      setBusy(false)
    }
  }
  return { run, busy, error, uncertain }
}
