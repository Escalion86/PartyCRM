'use client'

import { faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import getPersonFullName from '@helpers/getPersonFullName'

const ClientCard = ({ client, canManage, onDelete, onEdit, onView }) => {
  const displayName = getPersonFullName(client, 'Без имени')

  return (
    <PartyCard onClick={() => onView?.(client)}>
      <PartyCardHeader>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="mt-1 text-sm text-black/60">
            {[client.phone ? `+${client.phone}` : '', client.email]
              .filter(Boolean)
              .join(' · ') || 'контакты не указаны'}
          </p>
          {client.leadSource && (
            <p className="mt-1 text-sm text-black/60">
              Откуда узнал о компании: {client.leadSource}
            </p>
          )}
          {client.comment && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
              {client.comment}
            </p>
          )}
        </div>
        {canManage && (
          <PartyCardActions>
            <CardButton
              icon={faPencilAlt}
              onClick={() => onEdit && onEdit(client)}
              color="orange"
              tooltipText="Редактировать"
            />
            <CardButton
              icon={faTrash}
              onClick={() => onDelete && onDelete(client._id)}
              color="red"
              tooltipText="Удалить"
            />
          </PartyCardActions>
        )}
      </PartyCardHeader>
    </PartyCard>
  )
}

export default function ClientsList({
  clients,
  canManage,
  onDelete,
  onEdit,
  onView,
  onCreateClick,
  clientsCount,
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Клиенты</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-black/55">{clientsCount}</span>
          {canManage && (
            <button
              type="button"
              onClick={onCreateClick}
              className="grid h-10 w-10 place-items-center rounded-md bg-sky-600 text-2xl leading-none font-semibold text-white transition-colors hover:bg-sky-700"
              aria-label="Добавить клиента"
              title="Добавить клиента"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {clients.length === 0 && (
          <p className="text-sm text-black/55">Клиенты еще не добавлены.</p>
        )}
        {clients.map((client) => (
          <ClientCard
            key={client._id}
            client={client}
            canManage={canManage}
            onDelete={onDelete}
            onEdit={onEdit}
            onView={onView}
          />
        ))}
      </div>
    </div>
  )
}
