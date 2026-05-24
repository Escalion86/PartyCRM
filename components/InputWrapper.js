import { faAsterisk } from '@fortawesome/free-solid-svg-icons/faAsterisk'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import { forwardRef } from 'react'

const InputWrapper = forwardRef(
  (
    {
      label,
      labelClassName,
      value,
      className,
      required,
      children,
      floatingLabel = true,
      error,
      showErrorText,
      paddingY = true,
      paddingX = true,
      postfix,
      postfixClassName,
      prefix,
      prefixClassName,
      wrapperClassName,
      hidden = false,
      fullWidth = false,
      fitWidth = false,
      noBorder = false,
      disabled = false,
      noMargin = false,
      centerLabel = false,
      showDisabledIcon = true,
      smallMargin = false,
      comment,
      commentClassName,
      tone = 'default',
      ...props
    },
    ref
  ) => {
    const isParty = tone === 'party'

    const borderColorClass = error
      ? 'border-danger'
      : isParty
        ? 'border-sky-200'
        : 'border-input'

    const focusBorderClass = isParty
      ? 'focus-within:border-sky-500 hover:border-sky-400 [&:not(:focus-within)]:hover:border-sky-300'
      : 'focus-within:border-general hover:border-general [&:not(:focus-within)]:hover:border-opacity-50'

    const labelColorClass = isParty
      ? 'text-sky-700 peer-focus:text-sky-700 peer-placeholder-shown:text-disabled'
      : 'text-general peer-focus:text-general peer-placeholder-shown:text-disabled'

    return (
      <div
        className={cn(
          'relative flex h-fit items-stretch bg-white',
          paddingX === 'small' ? 'px-1' : paddingX ? 'px-2' : 'px-0',
          noMargin ? '' : smallMargin ? 'mt-3' : 'mt-3.5 mb-1',
          noBorder
            ? 'tablet:min-h-[40px] min-h-[36px]'
            : `tablet:min-h-[44px] [&:not(:focus-within)]:hover:border-opacity-50 min-h-[40px] rounded border-2 ${borderColorClass} ${focusBorderClass}`,
          fullWidth ? 'w-full' : '',
          fitWidth ? 'w-fit' : '',
          paddingY === 'small'
            ? 'pt-1.5 pb-1'
            : paddingY === 'big'
              ? 'pt-2.5 pb-2'
              : paddingY
                ? 'pt-2 pb-1.5'
                : '',
          disabled ? 'cursor-not-allowed' : '',
          hidden ? 'hidden' : '',
          (error && showErrorText) || comment ? 'mb-4' : '',
          className
        )}
        ref={ref}
        {...props}
      >
        <div
          className={cn(
            '[&:has(:focus)_.groupe]:max-w-full',
            'tablet:min-h-[28px] flex min-h-[24px] w-full items-center',
            wrapperClassName,
            disabled ? 'cursor-not-allowed' : ''
          )}
        >
          {prefix && (
            <div
              className={cn(
                'groupe text-disabled items-center overflow-hidden pl-1 transition-all',
                value ? 'max-w-full' : 'max-w-0',
                prefixClassName
              )}
            >
              {prefix}
            </div>
          )}
          {children}

          {(postfix || disabled) && (
            <div
              className={cn(
                'text-disabled flex items-center gap-x-1 pr-1',
                postfixClassName
              )}
            >
              {postfix}
              {disabled && showDisabledIcon && (
                <FontAwesomeIcon
                  className="w-4 h-4 text-disabled"
                  icon={faBan}
                  size="1x"
                />
              )}
            </div>
          )}

          {label && (
            <div
              className={cn(
                'pointer-events-none absolute rounded bg-white px-1 text-sm transition-all select-none peer-focus:leading-[12px]',
                'h-5 leading-[12px] peer-placeholder-shown:leading-[14px]',
                'flex items-center',
                required
                  ? 'max-w-[calc(100%-16px)] peer-placeholder-shown:max-w-full peer-focus:max-w-[calc(100%-16px)]'
                  : '',
                centerLabel ? 'left-1/2 -translate-x-1/2' : 'left-2',
                floatingLabel
                  ? `-top-[12px] peer-placeholder-shown:top-[calc(50%-10px)] peer-placeholder-shown:text-base peer-focus:-top-[12px] peer-focus:text-sm ${labelColorClass}`
                  : `-top-[12px] ${labelColorClass}`,
                disabled ? 'cursor-not-allowed' : '',
                labelClassName
              )}
            >
              {label}
            </div>
          )}
        </div>
        {required && (
          <div
            className={cn(
              'absolute -top-[9px] right-1 flex h-4 items-center bg-white px-1 text-xs',
              (value !== null &&
                typeof value === 'object' &&
                value.length > 0) ||
                (typeof value !== 'object' && (value || value === false))
                ? 'text-disabled'
                : 'text-danger'
            )}
          >
            <FontAwesomeIcon
              className={cn('h-2.5 w-2.5')}
              icon={faAsterisk}
              size="1x"
            />
          </div>
        )}
        {error && showErrorText && (
          <div
            className={cn(
              'text-danger absolute -bottom-[15px] left-1 bg-white px-1 text-xs leading-[12px] whitespace-nowrap'
            )}
          >
            {error}
          </div>
        )}
        {comment && (
          <div
            className={cn(
              'absolute right-1 -bottom-[15px] bg-white px-1 text-xs leading-[12px] whitespace-nowrap',
              commentClassName
            )}
          >
            {comment}
          </div>
        )}
      </div>
    )
  }
)

InputWrapper.displayName = 'InputWrapper'

export default InputWrapper
