import { atom } from 'jotai'
import usersAtom from '@state/atoms/usersAtom'

const userDeleteSelector = atom(
  () => null,
  (get, set, userId) => {
    if (!userId) return
    const items = get(usersAtom)
    set(
      usersAtom,
      items.filter((user) => user._id !== userId)
    )
  }
)

export default userDeleteSelector
