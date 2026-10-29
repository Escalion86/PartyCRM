'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function usePartyResourceCalendar({
  companyId,
  type,
  dateFrom,
  dateTo,
  resourceSearch = '',
  accessVersion = '',
  enabled = true,
}) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: '' })
  const generation = useRef(0)
  const key = `${companyId}:${type}:${dateFrom}:${dateTo}:${resourceSearch}:${accessVersion}:${revision}`
  const active = Boolean(enabled && companyId && type && dateFrom && dateTo)
  useEffect(() => {
    if (!active) return
    const current = ++generation.current
    const controller = new AbortController()
    const query = new URLSearchParams({ type, dateFrom, dateTo })
    if (resourceSearch) query.set('resourceSearch', resourceSearch)
    apiJson(`/api/party/resource-calendar?${query}`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (current !== generation.current) return
        const data = result?.data
        if (
          !data ||
          data.type !== type ||
          !Array.isArray(data.resources) ||
          !Array.isArray(data.items) ||
          !Array.isArray(data.resourceTypes)
        )
          throw new Error(
            'Не удалось получить календарь ресурсов. Повторите загрузку.'
          )
        setState({ key, data, error: '' })
      })
      .catch((cause) => {
        if (current === generation.current && cause.name !== 'AbortError')
          setState({
            key,
            data: null,
            error: cause.message || 'Не удалось загрузить календарь ресурсов',
          })
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [active, companyId, type, dateFrom, dateTo, resourceSearch, key])
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const current = active && state.key === key
  return {
    data: current ? state.data : null,
    busy: active && !current,
    error: current ? state.error : '',
    reload,
  }
}
