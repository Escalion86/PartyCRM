import PropTypes from 'prop-types'
import cn from 'classnames'

const CardStatusBar = ({ className }) => (
  <div className={cn('absolute left-0 top-0 h-full w-1.5', className)} />
)

CardStatusBar.propTypes = {
  className: PropTypes.string,
}

CardStatusBar.defaultProps = {
  className: '',
}

export default CardStatusBar
