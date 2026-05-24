import cn from 'classnames'
import { forwardRef } from 'react'

const VARIANT_CLASS = {
  primary: 'ui-btn ui-btn-primary',
  secondary: 'ui-btn ui-btn-secondary',
  ghost:
    'ui-btn border border-transparent bg-transparent text-general hover:bg-general/10',
  danger:
    'ui-btn border border-danger bg-danger text-white hover:brightness-95',
}

const SIZE_CLASS = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-sm',
}

const AppButton = forwardRef(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      className,
      fullWidth = false,
      disabled = false,
      type = 'button',
      ...props
    },
    ref
  ) => {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
          SIZE_CLASS[size] || SIZE_CLASS.md,
          fullWidth ? 'w-full' : '',
          className
        )}
      >
        {children}
      </button>
    )
  }
)

AppButton.displayName = 'AppButton'

export default AppButton
