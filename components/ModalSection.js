import cn from 'classnames'

const ModalSection = ({
  className,
  title,
  titleClassName,
  titleRight,
  children,
}) => (
  <div className={cn('rounded-lg border border-gray-200 p-3', className)}>
    {title ? (
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className={cn('text-sm font-semibold', titleClassName)}>{title}</div>
        {titleRight}
      </div>
    ) : null}
    {children}
  </div>
)

export default ModalSection

