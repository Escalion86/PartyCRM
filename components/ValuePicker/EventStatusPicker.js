import InputWrapper from '@components/InputWrapper'
import { EVENT_STATUSES } from '@helpers/constants'
import { getEventStatusButtonClasses } from '@helpers/eventStatusStyles'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'

const EventStatusPicker = ({
  status,
  onChange = null,
  required = false,
  disabledValues = [],
  error = false,
}) => (
  <InputWrapper
    label="Статус"
    value={status}
    required={required}
    error={error}
    paddingY
    fitWidth
  >
    <div className="flex flex-wrap gap-2">
      {EVENT_STATUSES.map((item) => {
        const isActive = item.value === status
        const isDisabled = disabledValues.includes(item.value)
        const buttonClasses = getEventStatusButtonClasses(
          item.value,
          isActive
        )

        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              'inline-flex min-h-[32px] items-center gap-2 rounded border px-3 py-1 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-general focus-visible:ring-offset-1',
              buttonClasses,
              isDisabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer',
              isActive ? 'shadow' : 'shadow-sm'
            )}
            onClick={
              !isDisabled && onChange
                ? () => onChange(item.value)
                : undefined
            }
            disabled={isDisabled}
          >
            {item.icon && <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />}
            <span>{item.name}</span>
          </button>
        )
      })}
    </div>
  </InputWrapper>
)

export default EventStatusPicker
