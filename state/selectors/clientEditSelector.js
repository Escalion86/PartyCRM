import { atom } from 'jotai'
import clientsAtom from '@state/atoms/clientsAtom'

const clientEditSelector = atom(
  () => null,
  (get, set, newItem) => {
    if (!newItem?._id) return

    const items = get(clientsAtom)
    const exists = items.find((client) => client._id === newItem._id)

    if (exists) {
      set(
        clientsAtom,
        items.map((client) => (client._id === newItem._id ? newItem : client))
      )
    } else {
      set(clientsAtom, [...items, newItem])
    }
  }
)

export default clientEditSelector
