import PropTypes from 'prop-types'
import cn from 'classnames'

const CardWrapper = ({
  style,
  outerClassName,
  className,
  role,
  tabIndex,
  onClick,
  children,
}) => (
  <div style={style} className={cn('px-2 py-2', outerClassName)}>
    <div
      role={role}
      tabIndex={tabIndex}
      onClick={onClick}
      className={cn(
        'ui-surface-card ui-surface-card--interactive hover:shadow-card relative h-full w-full overflow-hidden rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-general/60 focus-visible:ring-offset-2',
        className
      )}
    >
      {children}
    </div>
  </div>
)

CardWrapper.propTypes = {
  style: PropTypes.shape({}),
  outerClassName: PropTypes.string,
  className: PropTypes.string,
  role: PropTypes.string,
  tabIndex: PropTypes.number,
  onClick: PropTypes.func,
  children: PropTypes.node.isRequired,
}

CardWrapper.defaultProps = {
  style: null,
  outerClassName: '',
  className: '',
  role: 'button',
  tabIndex: 0,
  onClick: null,
}

export default CardWrapper
