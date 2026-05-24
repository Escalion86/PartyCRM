import { atom } from 'jotai'
import loggedUserAtom from '@state/atoms/loggedUserAtom'

const loggedUserActiveRoleSelector = atom((get) => {
  const loggedUser = get(loggedUserAtom)
  const role = loggedUser?.role ?? 'user'

  const isDev = role === 'dev'
  const isAdmin = role === 'admin'

  return {
    dev: isDev,
    users: {
      setRole: isDev || isAdmin,
      setStatus: isDev || isAdmin,
      seeBirthday: isDev || isAdmin,
      seeUserEvents: true,
    },
  }
})

export default loggedUserActiveRoleSelector
