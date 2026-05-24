import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'

const NativeSelect = ({
  children,
  className,
  wrapperClassName,
  arrowClassName,
  disabled = false,
  ...props
}) => (
  <div className={cn('relative', wrapperClassName)}>
    <select
      className={cn('appearance-none', className, 'pr-10')}
      disabled={disabled}
      {...props}
    >
      {children}
    </select>
    <FontAwesomeIcon
      icon={faChevronDown}
      className={cn(
        'pointer-events-none absolute top-1/2 right-2 h-2 w-2 -translate-y-1/2',
        disabled ? 'text-gray-400' : 'text-gray-700',
        arrowClassName
      )}
    />
  </div>
)

export default NativeSelect
