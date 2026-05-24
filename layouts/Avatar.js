/* eslint-disable @next/next/no-img-element */
import getUserAvatarSrc from '@helpers/getUserAvatarSrc'
import cn from 'classnames'

const Avatar = ({ user, className }) => (
  <img
    // onClick={() => closeMenu()}
    className={cn(
      'border-opacity-50 border-whiteobject-cover h-11 w-11 min-w-9 cursor-pointer rounded-full border',
      className
    )}
    src={getUserAvatarSrc(user)}
    alt="Avatar"
  />
)

export default Avatar
