'use client'

import { faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import { formatMoney } from '@helpers/formatMoney'

const specializationLabels = {
  animator: 'Аниматор',
  magician: 'Фокусник',
  host: 'Ведущий',
  photographer: 'Фотограф',
  workshop: 'Мастер-класс',
  other: 'Другое',
}

const ServiceCard = ({ service, canManage, onEdit, onDelete }) => {
  return (
    <PartyCard onClick={() => onEdit && onEdit(service)}>
      <PartyCardHeader>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {service.title || 'Без названия'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {service.specialization && (
              <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                {specializationLabels[service.specialization] ||
                  service.specialization}
              </span>
            )}
            {service.duration > 0 && (
              <span className="text-sm text-black/60">
                {service.duration} мин
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {service.price > 0 && (
            <span className="text-lg font-bold text-emerald-700">
              {formatMoney(service.price)}
            </span>
          )}
          {canManage && (
            <PartyCardActions>
              <CardButton
                icon={faPencilAlt}
                onClick={() => onEdit && onEdit(service)}
                color="blue"
                tooltipText="Редактировать"
              />
              <CardButton
                icon={faTrash}
                onClick={() => onDelete && onDelete(service._id)}
                color="red"
                tooltipText="Удалить"
              />
            </PartyCardActions>
          )}
        </div>
      </PartyCardHeader>
    </PartyCard>
  )
}

export default function ServicesList({
  services,
  canManage,
  onEdit,
  onDelete,
  onCreateClick,
  servicesCount,
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Услуги</h2>
        <div className="flex items-center gap-3">
          {servicesCount !== undefined && (
            <span className="text-sm text-black/55">{servicesCount}</span>
          )}
          {canManage && onCreateClick && (
            <button
              type="button"
              onClick={onCreateClick}
              className="grid h-10 w-10 place-items-center rounded-md bg-sky-600 text-2xl leading-none font-semibold text-white transition-colors hover:bg-sky-700"
              aria-label="Добавить услугу"
              title="Добавить услугу"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {services.length === 0 && (
          <p className="text-sm text-black/55">Услуги еще не добавлены.</p>
        )}
        {services.map((service) => (
          <ServiceCard
            key={service._id}
            service={service}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
