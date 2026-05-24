import cn from 'classnames'

const EmptyState = ({
  text,
  children,
  className,
  bordered = true,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center text-sm text-gray-500',
        bordered &&
          'rounded-lg border border-dashed border-gray-300 bg-white p-6',
        className
      )}
      {...props}
    >
      {children ?? text}
    </div>
  )
}

export default EmptyState
