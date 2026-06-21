import { formatMoney } from '@helpers/formatMoney'

const formatDateTime = (value) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getClientTitle = ({ call, clientsById }) => {
  const client = clientsById.get(String(call.linkedClientId || ''))
  const clientName = [client?.firstName, client?.secondName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return clientName || call.orderDraft?.client?.name || 'Клиент не указан'
}

const getCallStatusLabel = (call) => {
  if (call.linkedOrderId) return 'Заказ создан'
  if (call.eventDecision === 'pending') return 'Нужна проверка'
  if (call.status === 'ready') return 'Готово к обработке'
  if (call.status === 'processing') return 'Обработка'
  if (call.status === 'failed') return 'Ошибка'
  return 'Новый звонок'
}

export default function CallsList({
  calls = [],
  clientsById = new Map(),
  canManage = false,
  creatingCallId = '',
  onCreateOrder = () => {},
}) {
  if (!calls.length) {
    return (
      <div className="p-6 text-sm text-center bg-white border border-sky-100 rounded-2xl text-slate-500">
        Звонков Novofon пока нет.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {calls.map((call) => {
        const orderDraft = call.orderDraft
        const linkedOrderId = call.linkedOrderId
        const canCreateOrder = canManage && orderDraft && !linkedOrderId
        const isCreating = String(creatingCallId) === String(call._id)

        return (
          <article
            key={call._id}
            className="p-4 bg-white border border-sky-100 rounded-2xl"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-950">
                    {call.phone || call.normalizedPhone || 'Телефон не указан'}
                  </h3>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-50 text-sky-700">
                    {getCallStatusLabel(call)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(call.startedAt)} · {getClientTitle({ call, clientsById })}
                </p>
              </div>

              {canCreateOrder ? (
                <button
                  type="button"
                  disabled={isCreating}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-md bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  onClick={() => onCreateOrder(call._id)}
                >
                  {isCreating ? 'Создаю...' : 'Создать заказ'}
                </button>
              ) : linkedOrderId ? (
                <span className="px-3 py-2 text-sm font-semibold rounded-md bg-emerald-50 text-emerald-700">
                  Заказ создан
                </span>
              ) : null}
            </div>

            {call.aiSummary ? (
              <p className="mt-4 text-sm leading-6 text-slate-700">
                {call.aiSummary}
              </p>
            ) : call.transcript ? (
              <p className="mt-4 text-sm leading-6 text-slate-700 line-clamp-3">
                {call.transcript}
              </p>
            ) : null}

            {orderDraft ? (
              <div className="grid gap-2 p-3 mt-4 text-sm rounded-xl bg-slate-50 text-slate-700 md:grid-cols-3">
                <div>
                  <span className="block text-xs font-semibold text-slate-400">
                    Событие
                  </span>
                  {orderDraft.title || orderDraft.serviceTitle || 'Без названия'}
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-400">
                    Дата
                  </span>
                  {formatDateTime(orderDraft.eventDate)}
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-400">
                    Сумма
                  </span>
                  {formatMoney(orderDraft.contractAmount || 0)}
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
