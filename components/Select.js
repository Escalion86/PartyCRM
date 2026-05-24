import cn from 'classnames'
import InputWrapper from './InputWrapper'

const Select = ({
  label,
  labelClassName,
  value,
  onChange,
  options = [],
  placeholder,
  error = false,
  required = false,
  disabled = false,
  className,
  wrapperClassName,
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

  return (
    <InputWrapper
      label={label}
      labelClassName={cn(labelColorClass, labelClassName)}
      value={value || ''}
      required={required}
      error={error}
      className={cn('w-48', fullWidth ? 'w-full' : '', className)}
      noMargin={noMargin}
      smallMargin={smallMargin}
      tone={tone}
      floatingLabel={false}
    >
      <div className="relative flex-1">
        <select
          className={cn(
            'peer w-full cursor-pointer appearance-none bg-transparent px-1 pr-6 text-black outline-none',
            disabled ? 'text-disabled cursor-not-allowed bg-gray-50' : '',
            wrapperClassName
          )}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom arrow */}
        <div className="absolute text-gray-400 -translate-y-1/2 pointer-events-none top-1/2 right-2">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </InputWrapper>
  )
}

Select.displayName = 'Select'

export default Select
