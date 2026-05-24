import PropTypes from 'prop-types'
import CheckBox from '@components/CheckBox'
import AddIconButton from '@components/AddIconButton'
import InputWrapper from '@components/InputWrapper'
import { useAtomValue } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'
import cn from 'classnames'

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
  const services = propServices || atomServices || []
  const selectedIds = Array.isArray(value) ? value : []
  const isParty = tone === 'party'

  const toggleService = (serviceId) => {
    if (onClearError) onClearError()
    const isSelected = selectedIds.includes(serviceId)
    onChange(
      isSelected
        ? selectedIds.filter((id) => id !== serviceId)
        : [...selectedIds, serviceId]
    )
  }

  return (
    <InputWrapper label="Услуги" required={required} error={error} tone={tone}>
      <div className="flex items-center w-full gap-x-1">
        <div
          className={cn('flex flex-1 flex-col gap-1', isParty ? 'pl-1' : '')}
        >
          {services.length === 0 ? (
            <div className="text-sm text-gray-500">Услуги не добавлены</div>
          ) : (
            services.map((service) => (
              <CheckBox
                key={service._id}
                checked={selectedIds.includes(service._id)}
                label={service.title}
                big={isParty} // PartyCRM uses big checkboxes
                noMargin
                onClick={() => toggleService(service._id)}
                tone={tone}
              />
            ))
          )}
        </div>
        {onCreate && (
          <AddIconButton
            onClick={onCreate}
            title="Добавить услугу"
            size={isParty ? 'sm' : 'md'} // PartyCRM uses small button
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
  services: PropTypes.array, // optional: pass services via prop
  atom: PropTypes.object, // optional: specify data source atom
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
