'use client'

import { useState, useMemo } from 'react'
import { faPencilAlt, faTrash } from '@fortawesome/free-solid-svg-icons'
import IconActionButton from '@components/IconActionButton'
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
  const title = service.title || 'Без названия'
  const details = (
    <>
      <span className="block text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</span>
      {(service.specialization || service.duration > 0) && (
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {service.specialization && (
            <span>{specializationLabels[service.specialization] || service.specialization}</span>
          )}
          {service.duration > 0 && <span>{service.duration} мин</span>}
        </span>
      )}
    </>
  )

  return (
    <article className="relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
      {onEdit ? (
        <button
          type="button"
          className="min-h-11 min-w-0 flex-[1_1_10rem] cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-sky-700 after:absolute after:inset-0"
          onClick={() => onEdit(service)}
        >
          {details}
        </button>
      ) : (
        <div className="min-w-0 flex-[1_1_10rem]">{details}</div>
      )}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {service.price > 0 && (
          <span className="whitespace-nowrap text-sm font-semibold text-slate-900 tabular-nums">
            {formatMoney(service.price)}
          </span>
        )}
        {canManage && (
          <div className="relative z-10 flex shrink-0 gap-1">
            {onEdit && (
              <IconActionButton icon={faPencilAlt} onClick={() => onEdit(service)} title="Редактировать услугу" size="md" />
            )}
            {onDelete && (
              <IconActionButton icon={faTrash} onClick={() => onDelete(service._id)} title="Удалить услугу" variant="danger" size="md" />
            )}
          </div>
        )}
      </div>
    </article>
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
              <div className="mt-2 flex flex-col gap-2 pl-5">
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
                <div className="mt-2 flex flex-col gap-2 pl-5">
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

      <div className="mt-5 grid gap-3">{renderServices()}</div>
    </div>
  )
}
