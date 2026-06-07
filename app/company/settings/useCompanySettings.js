'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function useCompanySettings(activeCompanyId) {
  const [settings, setSettings] = useState(null)
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const buildRequestOptions = useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(activeCompanyId
          ? { 'x-partycrm-company-id': activeCompanyId }
          : {}),
      },
    }),
    [activeCompanyId]
  )

  const reload = useCallback(async () => {
    if (!activeCompanyId) {
      setSettings(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await apiJson(
        '/api/party/company-settings',
        buildRequestOptions({ cache: 'no-store' })
      )
      setSettings(response.data?.settings ?? response.data ?? {})
      setAccess(response.data?.access ?? null)
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить настройки компании')
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, buildRequestOptions])

  const savePatch = useCallback(
    async (patch) => {
      if (!activeCompanyId) return null

      setSaving(true)
      setError('')
      try {
        const response = await apiJson(
          '/api/party/company-settings',
          buildRequestOptions({
            method: 'PATCH',
            body: JSON.stringify(patch),
          })
        )
        setSettings(response.data?.settings ?? response.data ?? {})
        setAccess(response.data?.access ?? null)
        return response.data?.settings ?? response.data ?? {}
      } catch (saveError) {
        setError(saveError.message || 'Не удалось сохранить настройки компании')
        throw saveError
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId, buildRequestOptions]
  )

  useEffect(() => {
    reload()
  }, [reload])

  return {
    settings,
    setSettings,
    access,
    loading,
    saving,
    error,
    reload,
    savePatch,
  }
}
