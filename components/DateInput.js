import cn from 'classnames'
import InputWrapper from './InputWrapper'

const DateInput = ({
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

  // Преобразуем dayjs/Date/string в YYYY-MM-DD
  const toInputValue = (val) => {
    if (!val) return ''
    if (typeof val === 'string') {
      // Попробуем распарсить как ISO
      const d = new Date(val)
      if (isNaN(d.getTime())) return ''
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    if (val?.format) return val.format('YYYY-MM-DD')
    if (val instanceof Date) {
      const y = val.getFullYear()
      const m = String(val.getMonth() + 1).padStart(2, '0')
      const day = String(val.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return ''
  }

  const handleChange = (e) => {
    const val = e.target.value // YYYY-MM-DD
    if (!val) {
      onChange?.(null)
      return
    }
    // Возвращаем ISO-строку
    onChange?.(new Date(val + 'T00:00:00').toISOString())
  }

  return (
    <InputWrapper
      label={label}
      labelClassName={cn(labelColorClass, labelClassName)}
      value={toInputValue(value) || ''}
      required={required}
      error={error}
      className={cn('w-48', fullWidth ? 'w-full' : '', className)}
      noMargin={noMargin}
      smallMargin={smallMargin}
      tone={tone}
      floatingLabel={false}
    >
      <input
        type="date"
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

DateInput.displayName = 'DateInput'

export default DateInput
