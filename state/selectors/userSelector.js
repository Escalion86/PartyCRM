import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { DEFAULT_USER } from '@helpers/constants'
import usersAtom from '@state/atoms/usersAtom'

export const userSelector = atomFamily((id) =>
  atom((get) => {
    if (!id) return DEFAULT_USER
    return get(usersAtom).find((item) => item._id === id)
  })
)

export default userSelector
