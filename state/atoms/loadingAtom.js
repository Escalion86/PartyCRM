import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'

const loadingAtom = atomFamily(() => atom(false))

export default loadingAtom
