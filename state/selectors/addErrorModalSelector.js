import errorFunc from '@layouts/modals/modalsFunc/errorFunc'
import { atom } from 'jotai'
import { modalsAtom } from '@state/atoms'
import addModalSelector from './addModalSelector'

const addErrorModalSelector = atom(
  (get) => get(modalsAtom),
  (get, set, data) => set(addModalSelector, errorFunc(data))
)

export default addErrorModalSelector
