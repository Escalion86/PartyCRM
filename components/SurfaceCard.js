import cn from 'classnames'

const SurfaceCard = ({
  children,
  className,
  paddingClassName = 'p-3',
  borderClassName = 'border border-gray-200',
}) => (
  <div
    className={cn(
      'surface-card ui-surface-card rounded-xl',
      borderClassName,
      paddingClassName,
      className
    )}
  >
    {children}
  </div>
)

export default SurfaceCard
