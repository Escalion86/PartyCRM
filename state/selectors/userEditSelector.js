import { atom } from 'jotai'
import usersAtom from '@state/atoms/usersAtom'

const userEditSelector = atom(
  () => null,
  (get, set, newItem) => {
    if (!newItem?._id) return

    const items = get(usersAtom)
    const exists = items.find((user) => user._id === newItem._id)

    if (exists) {
      set(
        usersAtom,
        items.map((user) => (user._id === newItem._id ? newItem : user))
      )
    } else {
      set(usersAtom, [...items, newItem])
    }
  }
)

export default userEditSelector
