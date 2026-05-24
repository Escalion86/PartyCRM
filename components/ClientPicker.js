import PropTypes from 'prop-types'
import { faExchangeAlt } from '@fortawesome/free-solid-svg-icons/faExchangeAlt'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import InputWrapper from '@components/InputWrapper'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import getPersonFullName from '@helpers/getPersonFullName'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import cn from 'classnames'

const ClientPicker = ({
  selectedClient,
  selectedClientId,
  onSelectClick,
  onCreateClick,
  onViewClick,
  onEditClick,
  disabled,
  label,
  required,
  error,
  paddingY,
  fullWidth,
  compact,
  tone,
  showSelectButton,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const isPartyTone = tone === 'party'
  const handleEdit = () => {
    if (!selectedClientId || disabled) return
    if (onEditClick) {
      onEditClick()
      return
    }
    if (onSelectClick) {
      onSelectClick()
      return
    }
    modalsFunc.client?.edit(selectedClientId)
  }
  const handleCreate = () => {
    if (disabled) return
    if (onCreateClick) {
      onCreateClick()
      return
    }
    modalsFunc.client?.add()
  }

  return (
    <InputWrapper
      label={label}
      required={required}
      error={error}
      paddingY={paddingY}
      fullWidth={fullWidth}
      disabled={disabled}
      tone={tone}
    >
      <div className="flex flex-wrap items-center w-full gap-2">
        <div
          className={cn(
            'flex flex-1 cursor-pointer justify-between rounded border bg-white shadow-sm transition',
            isPartyTone
              ? 'border-sky-100 hover:border-sky-300 hover:bg-sky-50/80 hover:shadow-sky-100/80'
              : 'hover:shadow-card border-gray-300',
            compact ? 'px-3 py-2 text-sm' : 'p-3'
          )}
          onClick={
            disabled
              ? undefined
              : selectedClientId && onViewClick
                ? onViewClick
                : onSelectClick
          }
        >
          <div
            className={cn(
              isPartyTone
                ? 'font-semibold text-slate-950'
                : 'font-semibold text-gray-900',
              compact ? 'text-sm' : 'text-base'
            )}
          >
            {getPersonFullName(selectedClient, { fallback: 'Не выбрано' })}
          </div>
          {selectedClient && (
            <>
              <div
                className={cn(
                  'text-sm',
                  isPartyTone ? 'text-slate-500' : 'text-gray-600'
                )}
              >
                {selectedClient?.phone
                  ? `+${selectedClient.phone}`
                  : 'Телефон не указан'}
              </div>
            </>
          )}
        </div>
        {selectedClientId && !disabled && (
          <IconActionButton
            icon={faPencilAlt}
            onClick={handleEdit}
            title="Редактировать клиента"
            variant={isPartyTone ? 'neutral' : 'warning'}
            size={compact ? 'sm' : 'lg'}
            className={
              isPartyTone
                ? 'border border-sky-100 bg-white text-sky-700 hover:bg-sky-50'
                : ''
            }
          />
        )}
        {selectedClientId && !disabled && showSelectButton && onSelectClick && (
          <IconActionButton
            icon={faExchangeAlt}
            onClick={onSelectClick}
            title="Выбрать другого клиента"
            variant={isPartyTone ? 'neutral' : 'neutral'}
            size={compact ? 'sm' : 'lg'}
            className={
              isPartyTone
                ? 'border border-sky-100 bg-white text-sky-700 hover:bg-sky-50'
                : ''
            }
          />
        )}
        {!disabled && (
          <AddIconButton
            onClick={handleCreate}
            title="Создать нового клиента"
            size={compact ? 'sm' : 'lg'}
            variant={isPartyTone ? 'neutral' : 'success'}
            className={
              isPartyTone
                ? 'border border-sky-100 bg-sky-600 text-white hover:bg-sky-700'
                : ''
            }
          />
        )}
      </div>
    </InputWrapper>
  )
}

ClientPicker.propTypes = {
  selectedClient: PropTypes.shape({
    firstName: PropTypes.string,
    secondName: PropTypes.string,
    phone: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  selectedClientId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelectClick: PropTypes.func.isRequired,
  onCreateClick: PropTypes.func,
  onViewClick: PropTypes.func,
  onEditClick: PropTypes.func,
  disabled: PropTypes.bool,
  label: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  paddingY: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
  fullWidth: PropTypes.bool,
  compact: PropTypes.bool,
  tone: PropTypes.oneOf(['default', 'party']),
  showSelectButton: PropTypes.bool,
}

ClientPicker.defaultProps = {
  selectedClient: null,
  selectedClientId: null,
  disabled: false,
  label: 'Клиент',
  required: false,
  error: null,
  paddingY: true,
  fullWidth: false,
  compact: false,
  tone: 'default',
  showSelectButton: false,
  onCreateClick: null,
  onViewClick: null,
  onEditClick: null,
}

export default ClientPicker
