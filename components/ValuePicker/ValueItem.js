import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import Image from 'next/image'

const ValueItem = ({
  active = false,
  value = 0,
  name = '',
  color = 'gray',
  icon = null,
  imageSrc = null,
  onClick = null,
  hoverable,
  className,
}) => (
  <button
    className={cn(
      'value-picker-item group flex h-[30px] min-w-22 flex-nowrap items-center justify-center gap-x-2 rounded border px-2 py-0.5 outline-none duration-300',
      active
        ? 'value-picker-item--active'
        : onClick
          ? 'value-picker-item--idle'
          : 'value-picker-item--disabled',
      onClick ? 'cursor-pointer' : 'cursor-not-allowed',
      hoverable ? 'value-picker-item--hoverable' : '',
      className
    )}
    onClick={onClick ? () => onClick(value) : null}
  >
    {icon && <FontAwesomeIcon icon={icon} className="h-5" />}
    {imageSrc && (
      <div className="w-5 h-5">
        <Image src={imageSrc} width="20" height="20" alt={value} />
      </div>
    )}
    <div
      className={cn(
        'value-picker-item__label whitespace-nowrap duration-300 select-none',
        active ? 'value-picker-item__label--active' : '',
        hoverable ? 'value-picker-item__label--hoverable' : ''
      )}
    >
      {name}
    </div>
  </button>
)

export default ValueItem
