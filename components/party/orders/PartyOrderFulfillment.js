'use client'

import { useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import FieldHelp from '@components/FieldHelp'

export default function PartyOrderFulfillment({
  order,
  context,
  companyId,
  disabled,
  onSaved,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now] = useState(() => new Date())
  usePartyUnsavedChanges(false, {
    scope: companyId,
    label: 'отметка проведения',
    pending: busy,
  })
  if (
    !order._id ||
    !canPartyAccess(context, { resource: 'orders.fulfillment' })
  )
    return null
  const performed = order.fulfillment?.performedAt
  const plannedEnd =
    order.dateEnd ||
    (order.eventDate
      ? new Date(
          +new Date(order.eventDate) +
            (Number(order.durationMinutes) || 60) * 60000
        )
      : null)
  if (!performed && (!order.eventDate || +new Date(plannedEnd) > +now))
    return null
  const canEdit = canPartyAccess(context, {
    resource: 'orders.fulfillment',
    action: 'edit',
  })
  const submit = async () => {
    let reason
    if (performed) {
      reason = window.prompt('Почему нужно снять отметку проведения?')
      if (!reason?.trim()) return
    } else if (
      !window.confirm(
        'Подтвердить, что мероприятие проведено? Его согласованная сумма будет учтена в оказанных услугах независимо от оставшихся расчётов.'
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const result = await apiJson(
        `/api/party/orders/${order._id}/fulfillment`,
        {
          method: 'POST',
          headers: { 'x-partycrm-company-id': companyId },
          body: JSON.stringify({
            action: performed ? 'undo' : 'complete',
            expectedUpdatedAt: order.updatedAt,
            ...(reason ? { reason } : {}),
          }),
        }
      )
      onSaved(result.data)
    } catch (cause) {
      setError(cause.message || 'Не удалось записать проведение')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm sm:col-span-2">
      <p>
        {performed
          ? `Проведено: ${new Date(performed).toLocaleDateString('ru-RU')}`
          : 'Проведение ещё не отмечено'}{' '}
        <FieldHelp
          label="Проведение и расчёты"
          text="Проведение фиксирует оказанную услугу для отчётности. Оплаты, долги, гонорары и закрытие заказа ведутся отдельно. Перед отметкой сохраните изменения заказа."
        />
      </p>
      {canEdit && order.status !== 'canceled' && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={submit}
          className="min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? 'Сохранение…'
            : performed
              ? 'Исправить отметку'
              : 'Отметить проведение'}
        </button>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
