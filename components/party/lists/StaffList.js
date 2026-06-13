'use client'

import { faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import PartyStaffInvitePanel from '@components/party/staff/PartyStaffInvitePanel'

const roleLabels = {
  owner: 'Владелец',
  admin: 'Администратор',
  performer: 'Исполнитель',
}

const specializationLabels = {
  animator: 'Аниматор',
  magician: 'Фокусник',
  host: 'Ведущий',
  photographer: 'Фотограф',
  workshop: 'Мастер-класс',
  other: 'Другое',
}

const getCandidateName = (candidate) =>
  [candidate?.secondName, candidate?.firstName].filter(Boolean).join(' ') ||
  candidate?.phone ||
  candidate?.email ||
  ''

const StaffCard = ({
  person,
  canManage,
  onDelete,
  onEdit,
  onRequestLink,
  linkingStaffId,
  activeCompanyId,
}) => {
  const displayName =
    [person.secondName, person.firstName].filter(Boolean).join(' ') ||
    person.phone ||
    person.email ||
    'Без имени'
  const candidateName = getCandidateName(person.linkCandidate)
  const canRequestLink =
    canManage &&
    onRequestLink &&
    !person.authUserId &&
    person.hasLinkCandidate &&
    person.linkStatus !== 'link_requested' &&
    person.linkStatus !== 'linked'
  const isLinking = String(linkingStaffId || '') === String(person._id)

  return (
    <PartyCard onClick={() => onEdit && onEdit(person)}>
      <PartyCardHeader>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="mt-1 text-sm text-black/60">
            {roleLabels[person.role] || person.role} ·{' '}
            {[person.phone, person.email].filter(Boolean).join(' · ') ||
              'контакты не указаны'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!person.authUserId && (
              <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                Подрядчик без аккаунта
              </span>
            )}
            {person.authUserId && (
              <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                Аккаунт привязан
              </span>
            )}
            {!person.authUserId && person.linkStatus === 'link_requested' && (
              <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                Запрос привязки отправлен
              </span>
            )}
            {!person.authUserId && person.linkStatus === 'rejected' && (
              <span className="rounded bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                Привязка отклонена
              </span>
            )}
            {!person.authUserId &&
              person.hasLinkCandidate &&
              person.linkStatus !== 'link_requested' && (
                <span className="rounded bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                  Похожий аккаунт найден
                </span>
              )}
            {person.specialization && (
              <span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                {specializationLabels[person.specialization] ||
                  person.specialization}
              </span>
            )}
          </div>
          {candidateName && !person.authUserId && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">Аккаунт: {candidateName}</p>
              {canRequestLink && (
                <button
                  type="button"
                  disabled={isLinking}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRequestLink(person)
                  }}
                  className="w-fit cursor-pointer rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLinking ? 'Отправляем...' : 'Запросить привязку'}
                </button>
              )}
            </div>
          )}
          {!person.authUserId &&
            ['admin', 'performer'].includes(person.role) &&
            activeCompanyId ? (
              <PartyStaffInvitePanel
                staffId={person._id}
                activeCompanyId={activeCompanyId}
              />
            ) : null}
          {person.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
              {person.description}
            </p>
          )}
        </div>
        {canManage && (
          <PartyCardActions>
            {onEdit && (
              <CardButton
                icon={faPencilAlt}
                onClick={() => onEdit(person)}
                color="blue"
                tooltipText="Редактировать"
              />
            )}
            {onDelete && person.role !== 'owner' && (
              <CardButton
                icon={faTrash}
                onClick={() => {
                  if (
                    window.confirm(
                      `Вы уверены, что хотите удалить сотрудника "${displayName}" из компании?`
                    )
                  ) {
                    onDelete(person._id)
                  }
                }}
                color="red"
                tooltipText="Удалить"
              />
            )}
          </PartyCardActions>
        )}
      </PartyCardHeader>
    </PartyCard>
  )
}

export default function StaffList({
  staff,
  canManage,
  onDelete,
  onEdit,
  onRequestLink,
  linkingStaffId,
  onCreateClick,
  staffCount,
  activeCompanyId,
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Сотрудники</h2>
        <div className="flex items-center gap-3">
          {staffCount !== undefined && (
            <span className="text-sm text-black/55">{staffCount}</span>
          )}
          {canManage && onCreateClick && (
            <button
              type="button"
              onClick={onCreateClick}
              className="grid h-10 w-10 place-items-center rounded-md bg-sky-600 text-2xl leading-none font-semibold text-white transition-colors hover:bg-sky-700"
              aria-label="Добавить сотрудника"
              title="Добавить сотрудника"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {staff.length === 0 && (
          <p className="text-sm text-black/55">Сотрудники еще не добавлены.</p>
        )}
        {staff.map((person) => (
          <StaffCard
            key={person._id}
            person={person}
            canManage={canManage}
            onDelete={onDelete}
            onEdit={onEdit}
            onRequestLink={onRequestLink}
            linkingStaffId={linkingStaffId}
            activeCompanyId={activeCompanyId}
          />
        ))}
      </div>
    </div>
  )
}
