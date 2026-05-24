'use client'

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'

const normalizeCallsPayload = (payload) => ({
  data: Array.isArray(payload?.data) ? payload.data : [],
  meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
})

const upsertById = (items = [], nextItem) => {
  if (!nextItem?._id) return Array.isArray(items) ? items : []
  const list = Array.isArray(items) ? items : []
  const exists = list.some((item) => String(item?._id) === String(nextItem._id))
  if (!exists) return [nextItem, ...list]
  return list.map((item) =>
    String(item?._id) === String(nextItem._id) ? nextItem : item
  )
}

const setCallInQueries = (queryClient, call) => {
  if (!call?._id) return
  queryClient.setQueryData(queryKeys.call(call._id), call)
  queryClient.setQueriesData({ queryKey: ['calls'] }, (prev) => {
    if (!prev || !Array.isArray(prev?.data)) return prev
    return {
      ...prev,
      data: upsertById(prev.data, call),
    }
  })
}

export const useCallsQuery = ({ status = 'all', limit = 80, ...options } = {}) =>
  useQuery({
    queryKey: queryKeys.calls({ status, limit }),
    queryFn: async () => {
      const search = new URLSearchParams()
      if (status) search.set('status', status)
      if (limit) search.set('limit', String(limit))
      return normalizeCallsPayload(await apiJson(`/api/calls?${search}`))
    },
    ...options,
  })

export const useCallActions = () => {
  const queryClient = useQueryClient()

  const { mutateAsync: createCall } = useMutation({
    mutationFn: async (item) => {
      const payload = await apiJson('/api/calls', {
        method: 'POST',
        body: JSON.stringify(item),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: updateCall } = useMutation({
    mutationFn: async ({ callId, patch }) => {
      const payload = await apiJson(`/api/calls/${callId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: analyzeCall } = useMutation({
    mutationFn: async (callId) => {
      const payload = await apiJson(`/api/calls/${callId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: processRecording } = useMutation({
    mutationFn: async (callId) => {
      const payload = await apiJson(`/api/calls/${callId}/process-recording`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: ignoreCall } = useMutation({
    mutationFn: async (callId) => {
      const payload = await apiJson(`/api/calls/${callId}/ignore`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: linkCall } = useMutation({
    mutationFn: async ({ callId, clientId, eventId }) => {
      const payload = await apiJson(`/api/calls/${callId}/link`, {
        method: 'POST',
        body: JSON.stringify({ clientId, eventId }),
      })
      return payload?.data
    },
    onSuccess: (call) => setCallInQueries(queryClient, call),
  })

  const { mutateAsync: getEventDraft } = useMutation({
    mutationFn: async (callId) => {
      const payload = await apiJson(`/api/calls/${callId}/event-draft`)
      return payload?.data
    },
  })

  const { mutateAsync: decideCall } = useMutation({
    mutationFn: async ({ callId, decision }) => {
      const payload = await apiJson(`/api/calls/${callId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      })
      return payload?.data
    },
    onSuccess: (result) => setCallInQueries(queryClient, result?.call),
  })

  return useMemo(
    () => ({
      create: createCall,
      update: (callId, patch) => updateCall({ callId, patch }),
      analyze: analyzeCall,
      processRecording,
      ignore: ignoreCall,
      link: (callId, data) => linkCall({ callId, ...data }),
      getEventDraft,
      decide: (callId, decision) => decideCall({ callId, decision }),
    }),
    [
      analyzeCall,
      createCall,
      decideCall,
      getEventDraft,
      ignoreCall,
      linkCall,
      processRecording,
      updateCall,
    ]
  )
}
