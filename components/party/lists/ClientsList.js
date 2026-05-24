'use client'

import { faBoxArchive, faPencilAlt } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, { PartyCardActions, PartyCardHeader } from '@components/party/PartyCard'
import getPersonFullName from '@helpers/getPersonFullName'

const ClientCard = ({ client, canManage, onArchive, onEdit }) => {
  const displayName = getPersonFullName(client, 'Без имени')

  return (
    <PartyCard onClick={() => onEdit && onEdit(client)}>
      <PartyCardHeader>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{displayName}</p>
          <p className="mt-1 text-sm text-black/60">
            {[client.phone ? `+${client.phone}` : '', client.email].filter(Boolean).join(' · ') ||
              'контакты не указаны'}
          </p>
          {client.comment && (
            <p className="mt-2 text-sm leading-6 text-slate-500 line-clamp-2">
              {client.comment}
            </p>
          )}
        </div>
        {canManage && (
          <PartyCardActions>
            <CardButton
              icon={faPencilAlt}
              onClick={() => onEdit && onEdit(client)}
              color="blue"
              tooltipText="Редактировать"
            />
            <CardButton
              icon={faBoxArchive}
              onClick={() => onArchive(client._id)}
              color="red"
              tooltipText="Архив"
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
  onArchive,
  onEdit,
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
              className="grid h-10 w-10 place-items-center rounded-md bg-sky-600 text-2xl font-semibold leading-none text-white transition-colors hover:bg-sky-700"
              aria-label="Добавить клиента"
              title="Добавить клиента"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 mt-5">
        {clients.length === 0 && (
          <p className="text-sm text-black/55">Клиенты еще не добавлены.</p>
        )}
        {clients.map((client) => (
          <ClientCard
            key={client._id}
            client={client}
            canManage={canManage}
            onArchive={onArchive}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}
