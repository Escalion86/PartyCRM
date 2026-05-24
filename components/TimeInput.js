import cn from 'classnames'
import InputWrapper from './InputWrapper'

const TimeInput = ({
  label,
  value, // ожидается ISO-строка или dayjs объект с .format()
  onChange, // (isoString) => void
  required = false,
  error = false,
  disabled = false,
  className,
  labelClassName,
  tone = 'default',
  fullWidth = false,
  noMargin = false,
  smallMargin = false,
  ...props
}) => {
  const isParty = tone === 'party'

  const borderColorClass = error
    ? 'border-danger'
    : isParty
      ? 'border-sky-200 focus-within:border-sky-500 hover:border-sky-400'
      : 'border-input focus-within:border-general hover:border-general'

  const labelColorClass = isParty
    ? 'text-sky-700 peer-focus:text-sky-700 peer-placeholder-shown:text-disabled'
    : 'text-general peer-focus:text-general peer-placeholder-shown:text-disabled'

  // Преобразуем dayjs/Date/string в HH:mm
  const toInputValue = (val) => {
    if (!val) return ''
    if (typeof val === 'string') {
      const d = new Date(val)
      if (isNaN(d.getTime())) return ''
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    }
    if (val?.format) return val.format('HH:mm')
    if (val instanceof Date) {
      const h = String(val.getHours()).padStart(2, '0')
      const m = String(val.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    }
    return ''
  }

  const handleChange = (e) => {
    const val = e.target.value // HH:mm
    if (!val) {
      onChange?.(null)
      return
    }
    // Возвращаем ISO-строку с датой (используем текущую дату как заглушку)
    const [h, m] = val.split(':')
    const d = new Date()
    d.setHours(Number(h), Number(m), 0, 0)
    onChange?.(d.toISOString())
  }

  return (
    <InputWrapper
      label={label}
      labelClassName={cn(labelColorClass, labelClassName)}
      value={toInputValue(value) || ''}
      required={required}
      error={error}
      className={cn('w-36', fullWidth ? 'w-full' : '', className)}
      noMargin={noMargin}
      smallMargin={smallMargin}
      tone={tone}
      floatingLabel={false}
    >
      <input
        type="time"
        className={cn(
          'peer w-full flex-1 bg-transparent px-1 py-1 outline-none',
          'min-h-[36px] rounded border-2',
          borderColorClass,
          disabled
            ? 'text-disabled cursor-not-allowed bg-gray-50'
            : 'text-black'
        )}
        value={toInputValue(value)}
        onChange={handleChange}
        disabled={disabled}
        {...props}
      />
    </InputWrapper>
  )
}

TimeInput.displayName = 'TimeInput'

export default TimeInput
