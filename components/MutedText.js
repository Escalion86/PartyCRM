import cn from 'classnames'

const MutedText = ({ as: Component = 'span', className, children }) => {
  return (
    <Component className={cn('text-sm text-gray-600', className)}>
      {children}
    </Component>
  )
}

export default MutedText
