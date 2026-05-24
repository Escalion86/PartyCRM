import cn from 'classnames'
import InputWrapper from './InputWrapper'

const Textarea = ({
  label,
  onChange,
  value,
  inputClassName,
  labelClassName,
  wrapperClassName,
  error = false,
  rows = 3,
  required,
  defaultValue,
  noMargin = false,
  smallMargin = false,
  fullWidth = false,
  tone = 'default',
}) => {
  return (
    <InputWrapper
      label={label}
      labelClassName={labelClassName}
      value={value}
      className={wrapperClassName}
      required={required}
      error={error}
      noMargin={noMargin}
      smallMargin={smallMargin}
      fullWidth={fullWidth}
      tone={tone}
    >
      <textarea
        className={cn('flex-1 px-1 text-black outline-none', inputClassName)}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputWrapper>
  )
}

export default Textarea
