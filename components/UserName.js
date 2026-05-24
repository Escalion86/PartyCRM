import upperCaseFirst from '@helpers/upperCaseFirst'
import cn from 'classnames'

const UserName = ({ user, className, noWrap, thin, showStatus, trunc }) => {
  if (!user) return null

  return (
    <div
      className={cn(
        'flex items-center gap-x-1 overflow-visible',
        thin ? '-mt-0.5' : '',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-1 gap-x-1 leading-[14px]',
          noWrap ? 'flex-nowrap' : 'flex-wrap'
        )}
      >
        {user?.firstName && (
          <span className={cn(thin ? 'max-h-3 overflow-visible' : '')}>
            {upperCaseFirst(user.firstName)}
          </span>
        )}
        {user?.thirdName && (
          <span className={cn(thin ? 'max-h-3 overflow-visible' : '')}>
            {upperCaseFirst(user.thirdName)}
          </span>
        )}
        {user?.secondName && (
          <span className={cn(thin ? 'max-h-3 overflow-visible' : '')}>
            {upperCaseFirst(user.secondName)}
          </span>
        )}
      </div>
    </div>
  )
}

export default UserName
