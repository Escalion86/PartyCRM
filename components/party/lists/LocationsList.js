'use client'

import { faBoxArchive, faPencilAlt } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, { PartyCardActions, PartyCardHeader } from '@components/party/PartyCard'

const LocationCard = ({ location, canManage, onEdit, onArchive }) => {
  const addressParts = [
    location.address?.town,
    location.address?.street,
    location.address?.house,
    location.address?.room,
  ].filter(Boolean)

  return (
    <PartyCard onClick={() => onEdit(location)}>
      <PartyCardHeader>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{location.title}</p>
          <p className="mt-1 text-sm text-black/60">
            {addressParts.join(', ') || 'Адрес не указан'}
          </p>
        </div>
        {canManage && (
          <PartyCardActions>
            <CardButton
              icon={faPencilAlt}
              onClick={() => onEdit && onEdit(location)}
              color="blue"
              tooltipText="Редактировать"
            />
            <CardButton
              icon={faBoxArchive}
              onClick={() => onArchive(location._id)}
              color="orange"
              tooltipText="В архив"
            />
          </PartyCardActions>
        )}
      </PartyCardHeader>
      {location.address?.comment ? (
        <div className="px-4 pb-4">
          <p className="text-sm text-black/55 line-clamp-2">{location.address.comment}</p>
        </div>
      ) : null}
    </PartyCard>
  )
}

export default function LocationsList({
  locations,
  canManage,
  onEdit,
  onArchive,
  onCreateClick,
  onShowArchive,
  archivedCount,
  locationsCount,
}) {
  return (
    <div id="locations" className="mx-auto max-w-6xl scroll-mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Точки</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-black/55">{locationsCount}</span>
          {archivedCount > 0 && onShowArchive && (
            <button
              type="button"
              onClick={onShowArchive}
              className="text-sm font-semibold text-sky-700 hover:text-sky-900"
            >
              Архив: {archivedCount}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onCreateClick}
              className="grid h-10 w-10 place-items-center rounded-md bg-sky-600 text-2xl font-semibold leading-none text-white transition-colors hover:bg-sky-700"
              aria-label="Добавить точку"
              title="Добавить точку"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 mt-5">
        {locations.length === 0 && (
          <p className="text-sm text-black/55">Точки еще не добавлены.</p>
        )}
        {locations.map((location) => (
          <LocationCard
            key={location._id}
            location={location}
            canManage={canManage}
            onEdit={onEdit}
            onArchive={onArchive}
          />
        ))}
      </div>
    </div>
  )
}
