'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyPaymentExpectationsPanel from './PartyPaymentExpectationsPanel'
import PartyOrderInvitationPanel from '@components/party/invitations/PartyOrderInvitationPanel'

export default function PartyOrderExtensions({
  companyId,
  order,
  mode,
  disabled,
  onSaved,
}) {
  const [state, setState] = useState({ key: '', context: null, error: '' })
  const key = `${companyId}:${order._id}`
  useEffect(() => {
    if (!order._id) return
    const controller = new AbortController()
    apiJson(`/api/party/order-options?orderId=${order._id}`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key, context: result.data.context, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({ key, context: null, error: cause.message })
      })
    return () => controller.abort()
  }, [companyId, order._id, key])
  if (!order._id)
    return <p className="text-sm text-slate-600">Сначала сохраните заказ.</p>
  if (state.key !== key) return <p role="status">Загрузка раздела…</p>
  if (state.error)
    return (
      <p role="alert" className="text-sm text-red-800">
        {state.error}
      </p>
    )
  return mode === 'payments' ? (
    <PartyPaymentExpectationsPanel
      companyId={companyId}
      order={order}
      context={state.context}
      disabled={disabled}
      onSaved={onSaved}
    />
  ) : (
    <PartyOrderInvitationPanel
      companyId={companyId}
      order={order}
      context={state.context}
      disabled={disabled}
    />
  )
}
