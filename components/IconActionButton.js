import PropTypes from 'prop-types'
import cn from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const SIZE_CLASS = {
  xs: 'h-8 w-8',
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const ICON_CLASS = {
  xs: 'h-4 w-4',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-5 w-5',
}

const VARIANT_CLASS = {
  success: 'action-icon-button--success',
  warning: 'action-icon-button--warning',
  danger: 'action-icon-button--danger',
  neutral: 'action-icon-button--neutral',
}

const IconActionButton = ({
  icon,
  onClick,
  title = '',
  disabled = false,
  size = 'md',
  variant = 'neutral',
  className = '',
  iconClassName = '',
  type = 'button',
  label = '',
}) => (
  <button
    type={type}
    className={cn(
      'action-icon-button flex cursor-pointer items-center justify-center rounded',
      VARIANT_CLASS[variant] || VARIANT_CLASS.neutral,
      SIZE_CLASS[size] || SIZE_CLASS.md,
      className
    )}
    onClick={onClick}
    title={title}
    disabled={disabled}
  >
    <FontAwesomeIcon
      className={cn(ICON_CLASS[size] || ICON_CLASS.md, iconClassName)}
      icon={icon}
    />
    {label && (
      <span
        className={cn(
          'ml-1.5 font-medium whitespace-nowrap',
          size === 'xs' ? 'text-xs' : 'text-sm'
        )}
      >
        {label}
      </span>
    )}
  </button>
)

IconActionButton.propTypes = {
  icon: PropTypes.object.isRequired,
  onClick: PropTypes.func,
  title: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  variant: PropTypes.oneOf(['success', 'warning', 'danger', 'neutral']),
  className: PropTypes.string,
  iconClassName: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  label: PropTypes.string,
}

IconActionButton.defaultProps = {
  onClick: undefined,
  title: '',
  disabled: false,
  size: 'md',
  variant: 'neutral',
  className: '',
  iconClassName: '',
  type: 'button',
  label: '',
}

export default IconActionButton
