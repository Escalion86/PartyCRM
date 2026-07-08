import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import CheckBox from '@components/CheckBox'
import AddIconButton from '@components/AddIconButton'
import InputWrapper from '@components/InputWrapper'
import { useAtomValue } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import cn from 'classnames'
import { buildServicesListViewModel } from './party/lists/servicesListViewModel'

const EMPTY_SERVICES = []

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

const ServiceMultiSelect = ({
  value,
  onChange,
  services: propServices,
  atom,
  onCreate,
  error,
  required,
  onClearError,
  tone = 'default',
}) => {
  // Determine data source: prefer prop services, otherwise use atom
  const atomToUse = atom || servicesAtom
  const atomServices = useAtomValue(atomToUse)
  const allServices = propServices || atomServices || EMPTY_SERVICES
  const serviceGroups = useAtomValue(serviceGroupsAtom)
  const selectedIds = Array.isArray(value) ? value : []
  const isParty = tone === 'party'
  const [expandedGroups, setExpandedGroups] = useState({})

  const toggleService = (serviceId) => {
    if (onClearError) onClearError()
    const isSelected = selectedIds.includes(serviceId)
    onChange(
      isSelected
        ? selectedIds.filter((id) => id !== serviceId)
        : [...selectedIds, serviceId]
    )
  }

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const withoutGroupExpanded = expandedGroups['__without_group'] !== false

  const groupedData = useMemo(
    () =>
      buildServicesListViewModel({
        services: allServices,
        serviceGroups,
      }),
    [allServices, serviceGroups]
  )

  const groupsWithServices = groupedData.isGrouped
    ? groupedData.groups.filter((g) => {
        const servicesInGroup = groupedData.grouped[g._id]
        return Array.isArray(servicesInGroup) && servicesInGroup.length > 0
      })
    : []
  const sortedWithoutGroup = groupedData.isGrouped
    ? groupedData.withoutGroup
    : groupedData.flatList

  const hasServices =
    allServices.length > 0 ||
    groupsWithServices.length > 0 ||
    sortedWithoutGroup.length > 0

  return (
    <InputWrapper label="Услуги" required={required} error={error} tone={tone}>
      <div className="flex items-center w-full gap-x-1">
        <div
          className={cn('flex flex-1 flex-col gap-1', isParty ? 'pl-1' : '')}
        >
          {!hasServices ? (
            <div className="text-sm text-gray-500">Услуги не добавлены</div>
          ) : (
            <>
              {!groupedData.isGrouped &&
                sortedWithoutGroup.map((service) => (
                  <CheckBox
                    key={service._id}
                    checked={selectedIds.includes(service._id)}
                    label={
                      isParty
                        ? service.title
                        : `${service.title}${service.price ? ` — ${service.price} ₽` : ''}`
                    }
                    big={isParty}
                    noMargin
                    onClick={() => toggleService(service._id)}
                    tone={tone}
                  />
                ))}

              {/* Services without group */}
              {groupedData.isGrouped && sortedWithoutGroup.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup('__without_group')}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold transition',
                      isParty
                        ? 'text-sky-700 hover:bg-sky-50'
                        : 'text-gray-500 hover:bg-gray-100'
                    )}
                  >
                    <ChevronIcon open={withoutGroupExpanded} />
                    <span>Без группы</span>
                    <span className="text-xs font-normal text-gray-400">
                      {(() => {
                        const selected = sortedWithoutGroup.filter((s) =>
                          selectedIds.includes(s._id)
                        ).length
                        return selected > 0
                          ? `(Выбрано ${selected}/${sortedWithoutGroup.length})`
                          : `(${sortedWithoutGroup.length})`
                      })()}
                    </span>
                  </button>
                  {withoutGroupExpanded && (
                    <div className="flex flex-col gap-1 pl-5">
                      {sortedWithoutGroup.map((service) => (
                        <CheckBox
                          key={service._id}
                          checked={selectedIds.includes(service._id)}
                          label={service.title}
                          big={isParty}
                          noMargin
                          onClick={() => toggleService(service._id)}
                          tone={tone}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Groups with services */}
              {groupsWithServices.map((group) => {
                const isExpanded = expandedGroups[group._id] !== false
                const servicesInGroup = groupedData.grouped[group._id] || []

                return (
                  <div key={group._id} className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group._id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm font-semibold transition',
                        isParty
                          ? 'text-sky-700 hover:bg-sky-50'
                          : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <ChevronIcon open={isExpanded} />
                      <span>{group.title}</span>
                      <span className="text-xs font-normal text-gray-400">
                        {(() => {
                          const selected = servicesInGroup.filter((s) =>
                            selectedIds.includes(s._id)
                          ).length
                          return selected > 0
                            ? `(Выбрано ${selected}/${servicesInGroup.length})`
                            : `(${servicesInGroup.length})`
                        })()}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="flex flex-col gap-1 pl-5">
                        {servicesInGroup.map((service) => (
                          <CheckBox
                            key={service._id}
                            checked={selectedIds.includes(service._id)}
                            label={
                              isParty
                                ? service.title
                                : `${service.title}${service.price ? ` — ${service.price} ₽` : ''}`
                            }
                            big={isParty}
                            noMargin
                            onClick={() => toggleService(service._id)}
                            tone={tone}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
        {onCreate && (
          <AddIconButton
            onClick={onCreate}
            title="Добавить услугу"
            size={isParty ? 'sm' : 'md'}
            tone={tone}
          />
        )}
      </div>
    </InputWrapper>
  )
}

ServiceMultiSelect.propTypes = {
  value: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  ),
  onChange: PropTypes.func.isRequired,
  services: PropTypes.array,
  atom: PropTypes.object,
  onCreate: PropTypes.func,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  required: PropTypes.bool,
  onClearError: PropTypes.func,
  tone: PropTypes.oneOf(['default', 'party']),
}

ServiceMultiSelect.defaultProps = {
  value: [],
  services: null,
  atom: null,
  onCreate: null,
  error: null,
  required: false,
  onClearError: null,
  tone: 'default',
}

export default ServiceMultiSelect
