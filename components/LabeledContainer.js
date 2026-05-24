import cn from 'classnames'

const LabeledContainer = ({
  label,
  children,
  className,
  contentClassName,
  noMargin = false,
}) => {
  return (
    <div
      className={cn(
        'border-input relative w-full rounded border-2 bg-white px-2 pt-3 pb-2',
        noMargin ? '' : 'mt-3.5 mb-1',
        className
      )}
    >
      {label ? (
        <div className="text-general absolute -top-[8px] left-2 h-5 bg-white px-1 text-sm leading-[12px]">
          {label}
        </div>
      ) : null}
      <div className={cn('w-full', contentClassName)}>{children}</div>
    </div>
  )
}

export default LabeledContainer
