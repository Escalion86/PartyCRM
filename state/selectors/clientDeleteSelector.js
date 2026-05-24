import { atom } from 'jotai'
import clientsAtom from '@state/atoms/clientsAtom'

const clientDeleteSelector = atom(
  () => null,
  (get, set, itemId) => {
    if (!itemId) return
    const items = get(clientsAtom)
    set(
      clientsAtom,
      items.filter((item) => item._id !== itemId)
    )
  }
)

export default clientDeleteSelector

