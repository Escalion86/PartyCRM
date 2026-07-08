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
      'action-icon-button flex w-9 items-center justify-center rounded-bl-xl text-base font-normal duration-200',
      `action-icon-button--${toneByColor[color] || 'neutral'}`,
      paddingY ? 'h-9' : '',
      active ? 'ring-general/30 scale-105 ring-2' : ''
    )}
    onClick={onClick}
  >
    <FontAwesomeIcon icon={icon} className="h-6 w-6" />
  </button>
)

export default CardButton
