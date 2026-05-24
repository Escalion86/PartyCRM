import AppButton from '@components/AppButton'

const DateTimeApplyControl = ({
  value,
  onChange,
  onApply,
  disabled = false,
  inputClassName = '',
  buttonClassName = '',
  buttonLabel = 'Применить',
}) => {
  return (
    <>
      <input
        type="datetime-local"
        className={`col-span-2 h-9 w-full rounded border border-gray-300 px-2 text-sm text-gray-800 outline-none focus:border-general tablet:col-span-1 tablet:w-auto ${inputClassName}`}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <AppButton
        size="sm"
        variant="primary"
        className={`col-span-2 w-full rounded tablet:col-span-1 tablet:w-auto ${buttonClassName}`}
        disabled={disabled}
        onClick={onApply}
      >
        {buttonLabel}
      </AppButton>
    </>
  )
}

export default DateTimeApplyControl

