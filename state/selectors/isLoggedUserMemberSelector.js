import { atom } from 'jotai'
import loggedUserAtom from '@state/atoms/loggedUserAtom'

const isLoggedUserMemberSelector = atom((get) => {
  const loggedUser = get(loggedUserAtom)
  return loggedUser?.status === 'member'
})

export default isLoggedUserMemberSelector
