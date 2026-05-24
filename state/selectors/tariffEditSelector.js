import { atom } from 'jotai'
import tariffsAtom from '@state/atoms/tariffsAtom'

const tariffEditSelector = atom(
  () => null,
  (get, set, newItem) => {
    if (!newItem?._id) return

    const items = get(tariffsAtom)
    const exists = items.find((tariff) => tariff._id === newItem._id)

    if (exists) {
      set(
        tariffsAtom,
        items.map((tariff) =>
          tariff._id === newItem._id ? newItem : tariff
        )
      )
    } else {
      set(tariffsAtom, [...items, newItem])
    }
  }
)

export default tariffEditSelector
