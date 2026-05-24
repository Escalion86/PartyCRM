import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'

const toneByColor = {
  red: 'danger',
  orange: 'warning',
  blue: 'neutral',
  green: 'success',
  gray: 'neutral',
}

const CardButton = ({
  active,
  icon,
  onClick,
  color = 'red',
  tooltipText,
  paddingY = true,
}) => (
  <button
    type="button"
    title={tooltipText}
    className={cn(
      'action-icon-button flex w-9 items-center justify-center rounded-full text-base font-normal duration-200',
      `action-icon-button--${toneByColor[color] || 'neutral'}`,
      paddingY ? 'h-9' : '',
      active ? 'scale-105 ring-2 ring-general/30' : ''
    )}
    onClick={onClick}
  >
    <FontAwesomeIcon icon={icon} className="w-6 h-6" />
  </button>
)

export default CardButton
