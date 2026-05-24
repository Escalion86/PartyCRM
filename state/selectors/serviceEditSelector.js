import { atom } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'

const serviceEditSelector = atom(
  () => null,
  (get, set, newItem) => {
    if (!newItem?._id) return

    const items = get(servicesAtom)
    const exists = items.find((service) => service._id === newItem._id)

    if (exists) {
      set(
        servicesAtom,
        items.map((service) =>
          service._id === newItem._id ? newItem : service
        )
      )
    } else {
      set(servicesAtom, [...items, newItem])
    }
  }
)

export default serviceEditSelector
