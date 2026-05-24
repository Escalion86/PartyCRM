import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import eventsAtom from '@state/atoms/eventsAtom'

export const eventSelector = atomFamily((id) =>
  atom((get) => {
    if (!id) return undefined
    return get(eventsAtom).find((item) => item._id === id)
  })
)

export default eventSelector
