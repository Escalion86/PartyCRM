import PropTypes from 'prop-types'
import cn from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ActionIconButton from './ActionIconButton'

const ICON_CLASS = {
  xs: 'h-4 w-4',
  sm: 'h-4 w-4',
  base: 'h-5 w-5',
  md: 'h-5 w-5',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
}

const IconActionButton = ({
  icon,
  onClick,
  title = '',
  disabled = false,
  size = 'base',
  variant = 'neutral',
  className = '',
  iconClassName = '',
  type = 'button',
  label = '',
}) => (
  <ActionIconButton
    type={type}
    className={className}
    onClick={onClick}
    title={title}
    disabled={disabled}
    size={size}
    variant={variant}
  >
    <FontAwesomeIcon
      className={cn(ICON_CLASS[size] || ICON_CLASS.base, iconClassName)}
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
  </ActionIconButton>
)

IconActionButton.propTypes = {
  icon: PropTypes.object.isRequired,
  onClick: PropTypes.func,
  title: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'md', 'lg', 'xl']),
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
  size: 'base',
  variant: 'neutral',
  className: '',
  iconClassName: '',
  type: 'button',
  label: '',
}

export default IconActionButton
