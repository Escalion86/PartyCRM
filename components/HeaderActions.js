import cn from 'classnames'

const HeaderActions = ({
  left,
  bottom,
  right,
  className,
  leftClassName,
  bottomClassName,
  rightClassName,
}) => {
  if (bottom) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
        <div
          className={cn(
            'order-1 min-w-0 flex-1 tablet:flex-none',
            leftClassName
          )}
        >
          {left}
        </div>
        <div
          className={cn(
            'order-2 shrink-0 tablet:order-3',
            rightClassName
          )}
        >
          {right}
        </div>
        <div
          className={cn(
            'order-3 flex basis-full justify-center tablet:order-2 tablet:basis-auto tablet:justify-start',
            bottomClassName
          )}
        >
          {bottom}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-1 items-center justify-between', className)}>
      <div className={cn('flex items-center gap-3', leftClassName)}>{left}</div>
      <div className={cn('flex items-center gap-3', rightClassName)}>
        {right}
      </div>
    </div>
  )
}

export default HeaderActions
