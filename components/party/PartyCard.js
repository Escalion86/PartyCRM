import CardWrapper from '@components/CardWrapper'
import CardActions from '@components/CardActions'

export default function PartyCard({
  children,
  onClick,
  className = '',
  ...props
}) {
  return (
    <CardWrapper
      className={`cursor-pointer border-sky-200 transition-all hover:border-sky-400 hover:shadow-md ${className}`}
      onClick={(e) => {
        if (onClick && !e.target.closest('.action-icon-button')) {
          onClick()
        }
      }}
      {...props}
    >
      {children}
    </CardWrapper>
  )
}

export function PartyCardHeader({ children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 p-4 ${className}`}>
      {children}
    </div>
  )
}

export function PartyCardActions({ children, className = '' }) {
  return (
    <CardActions
      className={`!relative !top-auto !right-auto flex shrink-0 items-center gap-2 ${className}`}
    >
      {children}
    </CardActions>
  )
}

export function PartyCardBody({ children, className = '' }) {
  return <div className={`px-4 pb-4 ${className}`}>{children}</div>
}
