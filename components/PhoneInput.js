import cn from 'classnames'
import { MaskedInput } from '@thaborach/react-text-mask'
import InputWrapper from './InputWrapper'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { faPaste } from '@fortawesome/free-solid-svg-icons/faPaste'
import copyToClipboard from '@helpers/copyToClipboard'

const toPhoneValue = (digits) => {
  if (!digits) return null
  return Number(`7${digits.slice(0, 10)}`)
}

const phoneMask = [
  '(',
  /[1-9]/,
  /\d/,
  /\d/,
  ')',
  ' ',
  /\d/,
  /\d/,
  /\d/,
  '-',
  /\d/,
  /\d/,
  '-',
  /\d/,
  /\d/,
]

const PhoneInput = ({
  value,
  label = 'Телефон',
  onChange,
  required = false,
  disabled,
  labelClassName,
  className,
  noMargin,
  error,
  showErrorText,
  copyPasteButtons = false,
  tone = 'default',
}) => {
  const isParty = tone === 'party'
  const phoneDisplayValue = (() => {
    if (value === null || value === undefined) return ''
    const digits = String(value).replace(/[^\d]/g, '')
    if (!digits || digits === '7') return ''
    return digits[0] === '7' ? digits.slice(1, 11) : digits.slice(0, 10)
  })()

  return (
    <InputWrapper
      label={label}
      labelClassName={labelClassName}
      value={value}
      required={required}
      className={cn('w-60', className)}
      disabled={disabled}
      noMargin={noMargin}
      error={error}
      showErrorText={showErrorText}
      tone={tone}
      wrapperClassName={
        disabled
          ? 'text-disabled cursor-not-allowed'
          : isParty
            ? 'text-sky-700'
            : 'text-white'
      }
    >
      <div className="flex items-center w-full gap-2">
        <div className={cn('text-gray-500', isParty && 'text-sky-700')}>+7</div>
        <MaskedInput
          disabled={disabled}
          placeholder=" "
          className={cn(
            'peer w-full bg-transparent px-1 placeholder-transparent focus:outline-hidden',
            required && (!value || String(value).length !== 11)
              ? 'border-red-700'
              : isParty
                ? 'border-sky-200 focus:border-sky-500'
                : 'border-gray-400',
            disabled
              ? 'text-disabled cursor-not-allowed'
              : isParty
                ? 'text-sky-900'
                : 'text-input'
          )}
          guide={false}
          mask={phoneMask}
          value={phoneDisplayValue}
          onKeyDown={(e) => {
            if (e.key !== 'Backspace') return
            const target = e.currentTarget
            const cursorAtEnd =
              target.selectionStart === target.selectionEnd &&
              target.selectionStart === target.value.length
            if (!cursorAtEnd || /\d$/.test(target.value)) return

            const digits = target.value.replace(/[^\d]/g, '')
            if (!digits) return
            e.preventDefault()
            onChange(toPhoneValue(digits.slice(0, -1)))
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '')
            onChange(toPhoneValue(digits))
          }}
        />
        {copyPasteButtons && !disabled && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex items-center justify-center text-gray-600 transition border border-gray-300 rounded cursor-pointer h-7 w-7 hover:bg-gray-50"
              onClick={() => {
                if (!navigator?.clipboard) return
                navigator.clipboard.readText().then((text) => {
                  const digits = String(text || '').replace(/[^\d]/g, '')
                  if (!digits) {
                    onChange(null)
                    return
                  }
                  let normalized = digits
                  if (normalized.startsWith('7') || normalized.startsWith('8'))
                    normalized = normalized.slice(1)
                  if (normalized.length > 10) normalized = normalized.slice(-10)
                  onChange(toPhoneValue(normalized))
                })
              }}
              title="Вставить номер"
            >
              <FontAwesomeIcon icon={faPaste} className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex items-center justify-center text-gray-600 transition border border-gray-300 rounded cursor-pointer h-7 w-7 hover:bg-gray-50"
              onClick={() => {
                if (!value) return
                const raw = String(value).replace(/[^\d]/g, '')
                const digits = raw.startsWith('7') ? raw.slice(1, 11) : raw
                if (!digits) return
                const formatted =
                  digits.length >= 10
                    ? `+7(${digits.slice(0, 3)}) ${digits.slice(
                        3,
                        6
                      )}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
                    : `+7${digits}`
                copyToClipboard(formatted)
              }}
              title="Скопировать номер"
            >
              <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </InputWrapper>
  )
}

export default PhoneInput
