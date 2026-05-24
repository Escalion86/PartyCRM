import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'

const isLoadedAtom = atomFamily(() => atom(false))

export default isLoadedAtom
