'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'

const OrderReadModal = dynamic(
  () => import('@components/party/orders/PartyOrderReadModal')
)
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50'
function ClientReadModal({ companyId, orderId, onClose }) {
  const [state, setState] = useState({ client: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    apiJson(`/api/party/orders/${orderId}/client`, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ client: result.data, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            client: null,
            error: cause.message || 'Клиент недоступен',
          })
      })
    return () => controller.abort()
  }, [companyId, orderId])
  return (
    <Modal
      open
      tone="party"
      size="lg"
      title="Карточка клиента"
      onClose={onClose}
      footer={
        <button className={button} type="button" onClick={onClose}>
          Закрыть карточку
        </button>
      }
    >
      {state.error ? (
        <p role="alert" className="text-red-800">
          {state.error}
        </p>
      ) : !state.client ? (
        <p role="status">Загрузка клиента…</p>
      ) : (
        <dl className="space-y-4">
          {[
            ['name', 'Имя'],
            ['phone', 'Телефон'],
            ['email', 'Email'],
            ['whatsapp', 'WhatsApp'],
            ['telegram', 'Telegram'],
            ['max', 'MAX'],
            ['vk', 'VK'],
          ].map(([field, title]) =>
            state.client[field] ? (
              <div key={field}>
                <dt className="text-sm text-slate-600">{title}</dt>
                <dd className="mt-1 font-semibold break-words">
                  {field === 'phone' ? (
                    <a
                      className="text-sky-800 underline"
                      href={`tel:${String(state.client[field]).replace(/[^+\d]/g, '')}`}
                    >
                      {state.client[field]}
                    </a>
                  ) : (
                    state.client[field]
                  )}
                </dd>
              </div>
            ) : null
          )}
        </dl>
      )}
    </Modal>
  )
}
export function PartyTaskOrderOverlays({ selection, onClose }) {
  if (!selection?.related) return null
  const { kind, related } = selection
  return kind === 'order' ? (
    <OrderReadModal
      companyId={related.companyId}
      orderId={related.orderId}
      onClose={onClose}
    />
  ) : kind === 'client' ? (
    <ClientReadModal
      companyId={related.companyId}
      orderId={related.orderId}
      onClose={onClose}
    />
  ) : null
}

export default function PartyTaskOrderLinks({ task, onOpenRelated }) {
  const [open, setOpen] = useState('')
  const related = task.relatedOrder
  if (!related)
    return task.orderTitle ? (
      <p className="mt-1 text-xs text-slate-600">Заказ: {task.orderTitle}</p>
    ) : null
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-sm font-medium text-slate-800">
        {task.orderTitle || 'Связанный заказ'}
      </p>
      {related.clientName || related.eventDate ? (
        <p className="text-xs text-slate-600">
          {[
            related.clientName,
            related.eventDate &&
              new Date(related.eventDate).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() =>
            onOpenRelated ? onOpenRelated('order', related) : setOpen('order')
          }
        >
          Посмотреть заказ
        </button>
        {related.canViewClient ? (
          <button
            type="button"
            className={button}
            onClick={() =>
              onOpenRelated
                ? onOpenRelated('client', related)
                : setOpen('client')
            }
          >
            Карточка клиента
          </button>
        ) : null}
      </div>
      {open === 'order' ? (
        <OrderReadModal
          companyId={related.companyId}
          orderId={related.orderId}
          onClose={() => setOpen('')}
        />
      ) : null}
      {open === 'client' ? (
        <ClientReadModal
          companyId={related.companyId}
          orderId={related.orderId}
          onClose={() => setOpen('')}
        />
      ) : null}
    </div>
  )
}
