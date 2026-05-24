import PropTypes from 'prop-types'

const CardActions = ({ children, className }) => (
  <div
    className={`absolute right-2 top-2 z-10 ${className || ''}`}
    onClick={(event) => event.stopPropagation()}
  >
    {children}
  </div>
)

CardActions.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
}

CardActions.defaultProps = {
  className: '',
}

export default CardActions
