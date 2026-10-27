'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

export default function useCompanySettings(activeCompanyId) {
  const [settings, setSettings] = useState(null)
  const [company, setCompany] = useState(null)
  const [access, setAccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingSaves, setPendingSaves] = useState(0)
  const saving = pendingSaves > 0
  const [error, setError] = useState('')
  usePartyUnsavedChanges(false, {
    label: 'сохранение настроек компании',
    scope: activeCompanyId,
    pending: saving,
  })

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
      setCompany(null)
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
      setCompany(response.data?.company ?? null)
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

      setPendingSaves((count) => count + 1)
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
        setCompany(response.data?.company ?? null)
        setAccess(response.data?.access ?? null)
        return response.data ?? {}
      } catch (saveError) {
        setError(saveError.message || 'Не удалось сохранить настройки компании')
        throw saveError
      } finally {
        setPendingSaves((count) => Math.max(0, count - 1))
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
    company,
    setCompany,
    access,
    loading,
    saving,
    error,
    reload,
    savePatch,
  }
}
