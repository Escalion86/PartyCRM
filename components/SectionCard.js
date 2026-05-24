import cn from 'classnames'

const SectionCard = ({ as: Component = 'div', className, children, ...props }) => {
  return (
    <Component
      className={cn(
        'ui-surface-card rounded-lg',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

export default SectionCard
