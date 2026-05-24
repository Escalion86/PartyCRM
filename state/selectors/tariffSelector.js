import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { DEFAULT_TARIFF } from '@helpers/constants'
import tariffsAtom from '@state/atoms/tariffsAtom'

export const tariffSelector = atomFamily((id) =>
  atom((get) => {
    if (!id) return DEFAULT_TARIFF
    return get(tariffsAtom).find((item) => item._id === id)
  })
)

export default tariffSelector
