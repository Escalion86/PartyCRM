'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function usePartyToday(companyId) {
  const [state, setState] = useState({
    key: '',
    data: null,
    busy: false,
    error: '',
  })
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const key = `${companyId}:${revision}`
  useEffect(() => {
    if (!companyId) return
    const current = ++generation.current
    const controller = new AbortController()
    apiJson('/api/party/today', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (current !== generation.current) return
        if (!result?.data || !Array.isArray(result.data.sections))
          throw new Error(
            'Не удалось получить рабочий экран. Повторите загрузку.'
          )
        setState({ key, data: result.data, busy: false, error: '' })
      })
      .catch((cause) => {
        if (current === generation.current && cause.name !== 'AbortError')
          setState({
            key,
            data: null,
            busy: false,
            error: cause.message || 'Не удалось загрузить рабочий экран',
          })
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, key])
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const current = state.key === key && Boolean(companyId)
  return {
    data: current ? state.data : null,
    busy: Boolean(companyId) && (!current || state.busy),
    error: current ? state.error : '',
    reload,
  }
}
