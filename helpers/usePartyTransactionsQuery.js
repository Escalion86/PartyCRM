'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { queryKeys } from '@helpers/queryKeys'
import {
  removePartyTransaction,
  upsertPartyTransaction,
} from './partyTransactionsCache'

const normalizeListPayload = (payload) =>
  Array.isArray(payload?.data) ? payload.data : []

export { removePartyTransaction, upsertPartyTransaction }

const buildCompanyHeaders = (activeCompanyId) =>
  activeCompanyId ? { 'x-partycrm-company-id': activeCompanyId } : {}

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams()
  if (params.orderId) query.set('orderId', params.orderId)
  const text = query.toString()
  return text ? `?${text}` : ''
}

const invalidatePartyTransactionLists = (queryClient, transaction) => {
  queryClient.invalidateQueries({ queryKey: ['party-transactions'] })
  if (transaction?.orderId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.partyTransactions({ orderId: transaction.orderId }),
    })
  }
}

export const usePartyTransactionsQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: queryKeys.partyTransactions(params),
    queryFn: async () =>
      normalizeListPayload(
        await apiJson(`/api/party/transactions${buildQueryString(params)}`, {
          headers: buildCompanyHeaders(params.activeCompanyId),
        })
      ),
    enabled: options.enabled ?? Boolean(params.orderId),
    ...options,
  })

export const useCreatePartyTransactionMutation = (activeCompanyId = '') => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item) => {
      const payload = await apiJson('/api/party/transactions', {
        method: 'POST',
        headers: buildCompanyHeaders(activeCompanyId),
        body: JSON.stringify(item),
      })
      return payload?.data
    },
    onSuccess: (transaction) => {
      if (!transaction?._id) return
      queryClient.setQueriesData({ queryKey: ['party-transactions'] }, (prev) =>
        Array.isArray(prev) ? upsertPartyTransaction(prev, transaction) : prev
      )
      invalidatePartyTransactionLists(queryClient, transaction)
    },
  })
}

export const useUpdatePartyTransactionMutation = (activeCompanyId = '') => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item) => {
      const payload = await apiJson(`/api/party/transactions/${item._id}`, {
        method: 'PATCH',
        headers: buildCompanyHeaders(activeCompanyId),
        body: JSON.stringify(item),
      })
      return payload?.data
    },
    onSuccess: (transaction) => {
      if (!transaction?._id) return
      queryClient.setQueriesData({ queryKey: ['party-transactions'] }, (prev) =>
        Array.isArray(prev) ? upsertPartyTransaction(prev, transaction) : prev
      )
      invalidatePartyTransactionLists(queryClient, transaction)
    },
  })
}

export const useDeletePartyTransactionMutation = (activeCompanyId = '') => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (transaction) => {
      await apiJson(`/api/party/transactions/${transaction._id}`, {
        method: 'DELETE',
        headers: buildCompanyHeaders(activeCompanyId),
      })
      return transaction
    },
    onSuccess: (transaction) => {
      queryClient.setQueriesData({ queryKey: ['party-transactions'] }, (prev) =>
        Array.isArray(prev) ? removePartyTransaction(prev, transaction._id) : prev
      )
      invalidatePartyTransactionLists(queryClient, transaction)
    },
  })
}
