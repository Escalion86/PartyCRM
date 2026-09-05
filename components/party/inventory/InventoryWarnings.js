'use client'

const formatDate = (value) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function InventoryWarnings({ result, services = [] }) {
  if (!result) return null
  const titleFor = (id) =>
    services.find((service) => String(service._id) === String(id))?.title ||
    'Услуга'
  if (!result.hasShortage)
    return (
      <div className="space-y-2">
        <p
          className="rounded-lg bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {result.demand?.length === 0
            ? 'В комплекте нет реквизита. Добавьте его вручную или настройте состав услуги.'
            : 'Реквизита достаточно на выбранные интервалы.'}
        </p>
        {!!result.holdingRisks?.length && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Часть реквизита ещё у сотрудников</strong>
            {result.holdingRisks.map((holding, index) => (
              <div key={index}>
                {holding.title}: {holding.quantity} у {holding.holderName} ·
                заказ № {String(holding.orderId).slice(-6)} · возврат{' '}
                {holding.expectedReturnAt
                  ? formatDate(holding.expectedReturnAt)
                  : 'не указан'}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  return (
    <div className="space-y-2" role="alert">
      <p className="font-semibold text-amber-900">
        Реквизита не хватает. Измените комплект или подтвердите сохранение с
        дефицитом.
      </p>
      {result.warnings.map((warning, index) => (
        <div
          key={`${warning.resourceId}:${index}`}
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
        >
          <strong>
            {warning.title}: не хватает {warning.shortage}
          </strong>
          <div>
            {formatDate(warning.startAt)} — {formatDate(warning.endAt)}
          </div>
          <div>
            Всего {warning.quantity}, недоступно {warning.unavailableQuantity},
            занято {warning.occupied}, нужно {warning.needed}
          </div>
          {warning.conflicts.map((conflict, number) => (
            <div key={number}>
              Заказ {conflict.orderTitle} · №{' '}
              {String(conflict.orderId).slice(-6)} ·{' '}
              {titleFor(conflict.serviceId)}: {conflict.quantity}
            </div>
          ))}
          {warning.holders?.map((holder, number) => (
            <div key={`holder:${number}`}>
              Ещё не возвращено: {holder.quantity} у {holder.holderName} · заказ
              № {String(holder.orderId).slice(-6)} · срок{' '}
              {holder.expectedReturnAt
                ? formatDate(holder.expectedReturnAt)
                : 'не указан'}
            </div>
          ))}
          {warning.serviceLineIds.length > 1 && (
            <div>
              Внутри этого заказа одновременно используется в{' '}
              {warning.serviceLineIds.length} услугах.
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
