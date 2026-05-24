import PropTypes from 'prop-types'
import cn from 'classnames'

const CabinetFilterChip = ({
  active,
  label,
  selectedClassName,
  idleClassName,
  dotClassName,
  onClick,
  className,
  disabled = false,
}) => (
  <button
    type="button"
    className={cn(
      'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
      active ? selectedClassName : idleClassName,
      disabled ? 'cursor-not-allowed opacity-60' : '',
      className
    )}
    onClick={onClick}
    disabled={disabled}
  >
    <span
      className={cn(
        'h-2 w-2 rounded-full',
        active ? 'bg-white' : dotClassName
      )}
    />
    {label}
  </button>
)

CabinetFilterChip.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.string.isRequired,
  selectedClassName: PropTypes.string.isRequired,
  idleClassName: PropTypes.string.isRequired,
  dotClassName: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  className: PropTypes.string,
  disabled: PropTypes.bool,
}

CabinetFilterChip.defaultProps = {
  active: false,
  onClick: undefined,
  className: '',
  disabled: false,
}

export default CabinetFilterChip
