import PartyOrderServiceDetails from './PartyOrderServiceDetails'

const dateText = (value, timeZone) => value ? new Date(value).toLocaleString('ru-RU', {
  timeZone, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
}) : ''
const money = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`

export default function PartyOrderPlacesRead({ order, timeZone = 'Asia/Krasnoyarsk', showServices = true, showPricing = true }) {
  const places = order.places || []
  if (!places.length) return null
  const items = showServices ? order.orderItems || order.serviceSelections || [] : []
  const renderLines = (lines) => lines.length > 0 && (
    <ul className="divide-y divide-slate-100">
      {lines.map((item, index) => <li key={item.lineId || `${item.serviceId}:${index}`} className="flex min-w-0 items-baseline justify-between gap-3 py-2 text-sm">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          {item.title}{Number(item.quantity) > 1 ? ` × ${item.quantity}` : ''}
          {item.durationMinutes ? ` · ${item.durationMinutes * item.quantity} мин` : ''}
          <PartyOrderServiceDetails item={item} />
        </div>
        {showPricing && item.total != null && <span className="shrink-0 tabular-nums">{money(item.total)}</span>}
      </li>)}
    </ul>
  )
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{places.length === 1 ? 'Место' : 'Места'}</h2>
      <ul className="space-y-3" aria-label="Места заказа">
        {places.map((place) => {
          const zone = place.timeZone || timeZone
          const rent = [dateText(place.rental?.startsAt, zone), dateText(place.rental?.endsAt, zone)].filter(Boolean).join(' — ')
          const program = [dateText(place.eventDate, zone), dateText(place.dateEnd, zone)].filter(Boolean).join(' — ')
          const pricing = showPricing && place.pricingSnapshot
          return <li key={place.id} className="min-w-0 space-y-2 rounded-xl border border-slate-200 px-3 py-2">
            <h3 className="font-semibold [overflow-wrap:anywhere]">{place.locationTitle || 'Сохранённая площадка'}</h3>
            {place.locationAddress && <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">{place.locationAddress}</p>}
            {place.guestCount && <p className="text-sm text-slate-600">Гостей: {place.guestCount}</p>}
            {rent && <p className="text-sm text-slate-600">Аренда · {rent}</p>}
            {program && <p className="text-sm text-slate-600">Программа · {program}</p>}
            {place.locationConfiguration?.details?.length > 0 && <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">{place.locationConfiguration.details.join(' · ')}</p>}
            {renderLines(items.filter((item) => item.placeId === place.id))}
            {pricing && <p className="text-sm tabular-nums">
              Аренда {money(pricing.rentalKopecks / 100)}
              {pricing.rentalExtrasKopecks > 0 ? ` · Доплаты ${money(pricing.rentalExtrasKopecks / 100)}` : ''}
              {' · '}Подытог {money(pricing.subtotalKopecks / 100)}
            </p>}
          </li>
        })}
      </ul>
      {renderLines(items.filter((item) => !item.placeId))}
    </section>
  )
}
