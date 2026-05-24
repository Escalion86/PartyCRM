import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'

const errorAtom = atomFamily(() => atom(false))

export default errorAtom
