'use client'

import { useState, useMemo } from 'react'
import { faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons'
import CardButton from '@components/CardButton'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import { formatMoney } from '@helpers/formatMoney'
import { useAtomValue } from 'jotai'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import cn from 'classnames'
import { buildServicesListViewModel } from './servicesListViewModel'

const specializationLabels = {
  animator: 'Аниматор',
  magician: 'Фокусник',
  host: 'Ведущий',
  photographer: 'Фотограф',
  workshop: 'Мастер-класс',
  other: 'Другое',
}

const ChevronIcon = ({ open }) => (
  <svg
    className={cn(
      'h-4 w-4 text-gray-400 transition-transform',
      open && 'rotate-90'
    )}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
)

const ServiceCard = ({ service, canManage, onEdit, onDelete }) => {
  return (
    <PartyCard onClick={() => onEdit && onEdit(service)}>
      <PartyCardHeader>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">
            {service.title || 'Без названия'}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
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
        <div className="flex items-center gap-4 shrink-0">
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
  const serviceGroups = useAtomValue(serviceGroupsAtom)
  const [expandedGroups, setExpandedGroups] = useState({})

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const groupedData = useMemo(
    () => buildServicesListViewModel({ services, serviceGroups }),
    [services, serviceGroups]
  )

  const renderServices = () => {
    if (!groupedData.isGrouped) {
      return services.length === 0 ? (
        <p className="text-sm text-black/55">Услуги еще не добавлены.</p>
      ) : (
        groupedData.flatList.map((service) => (
          <ServiceCard
            key={service._id}
            service={service}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      )
    }

    // Tree view
    const { groups, grouped, withoutGroup } = groupedData
    const hasServicesInGroups = groups.some(
      (g) => (grouped[g._id]?.length || 0) > 0
    )

    if (!hasServicesInGroups && withoutGroup.length === 0) {
      return <p className="text-sm text-black/55">Услуги еще не добавлены.</p>
    }

    return (
      <>
        {/* Services without group */}
        {withoutGroup.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => toggleGroup('__without_group')}
              className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold text-gray-500 transition hover:bg-sky-50"
            >
              <ChevronIcon open={expandedGroups['__without_group'] !== false} />
              <span>Без группы</span>
              <span className="text-xs font-normal text-gray-400">
                ({withoutGroup.length})
              </span>
            </button>
            {expandedGroups['__without_group'] !== false && (
              <div className="flex flex-col gap-2 pl-5 mt-2">
                {withoutGroup.map((service) => (
                  <ServiceCard
                    key={service._id}
                    service={service}
                    canManage={canManage}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Groups with services */}
        {groups.map((group) => {
          const servicesInGroup = grouped[group._id] || []
          if (servicesInGroup.length === 0) return null
          const isExpanded = expandedGroups[group._id] !== false

          return (
            <div key={group._id}>
              <button
                type="button"
                onClick={() => toggleGroup(group._id)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              >
                <ChevronIcon open={isExpanded} />
                <span>{group.title}</span>
                <span className="text-xs font-normal text-gray-400">
                  ({servicesInGroup.length})
                </span>
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-2 pl-5 mt-2">
                  {servicesInGroup.map((service) => (
                    <ServiceCard
                      key={service._id}
                      service={service}
                      canManage={canManage}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
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
              className="grid w-10 h-10 text-2xl font-semibold leading-none text-white transition-colors rounded-md place-items-center bg-sky-600 hover:bg-sky-700"
              aria-label="Добавить услугу"
              title="Добавить услугу"
            >
              +
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 mt-5">{renderServices()}</div>
    </div>
  )
}
