import PropTypes from 'prop-types'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import InputWrapper from '@components/InputWrapper'
import getPersonFullName from '@helpers/getPersonFullName'
import IconActionButton from '@components/IconActionButton'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'

const ColleaguePicker = ({
  selectedColleague,
  selectedColleagueId,
  onSelectClick,
  disabled,
  label,
  required,
  error,
  paddingY,
  fullWidth,
  compact,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const handleEdit = () => {
    if (selectedColleagueId && !disabled)
      modalsFunc.client?.edit(selectedColleagueId)
  }

  return (
    <InputWrapper
      label={label}
      required={required}
      error={error}
      paddingY={paddingY}
      fullWidth={fullWidth}
      disabled={disabled}
    >
      <div className="flex w-full flex-wrap items-center gap-2">
        <div
          className={[
            'hover:shadow-card flex flex-1 cursor-pointer justify-between rounded border border-gray-300 bg-white shadow-sm transition',
            compact ? 'px-3 py-2 text-sm' : 'p-3',
          ].join(' ')}
          onClick={disabled ? undefined : onSelectClick}
        >
          <div
            className={[
              'font-semibold text-gray-900',
              compact ? 'text-sm' : 'text-base',
            ].join(' ')}
          >
            {getPersonFullName(selectedColleague, { fallback: 'Не выбрано' })}
          </div>
          {selectedColleague && (
            <div className="text-sm text-gray-600">
              {selectedColleague?.phone
                ? `+${selectedColleague.phone}`
                : 'Телефон не указан'}
            </div>
          )}
        </div>
        {selectedColleagueId && !disabled && (
          <IconActionButton
            icon={faPencilAlt}
            onClick={handleEdit}
            title="Редактировать коллегу"
            variant="warning"
            size={compact ? 'sm' : 'lg'}
          />
        )}
      </div>
    </InputWrapper>
  )
}

ColleaguePicker.propTypes = {
  selectedColleague: PropTypes.shape({
    firstName: PropTypes.string,
    secondName: PropTypes.string,
    phone: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  selectedColleagueId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
  onSelectClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  label: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  paddingY: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  fullWidth: PropTypes.bool,
  compact: PropTypes.bool,
}

ColleaguePicker.defaultProps = {
  selectedColleague: null,
  selectedColleagueId: null,
  disabled: false,
  label: 'Коллега',
  required: false,
  error: null,
  paddingY: true,
  fullWidth: false,
  compact: false,
}

export default ColleaguePicker
