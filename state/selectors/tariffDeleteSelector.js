import { atom } from 'jotai'
import { DEFAULT_TARIFF } from '@helpers/constants'
import tariffsAtom from '@state/atoms/tariffsAtom'

const tariffDeleteSelector = atom(
  () => DEFAULT_TARIFF,
  (get, set, itemId) => {
    const items = get(tariffsAtom)
    const newItemsList = items.filter((item) => item._id !== itemId)
    set(tariffsAtom, newItemsList)
  }
)

export default tariffDeleteSelector
