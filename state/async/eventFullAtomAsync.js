import { atom } from 'jotai'
import { getData } from '@helpers/CRUD'
import { DEFAULT_EVENT } from '@helpers/constants'
import isLoadedAtom from '@state/atoms/isLoadedAtom'
// import eventsAtom from '@state/atoms/eventsAtom'
import { atomWithDefault } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { setAtomValue } from '@state/storeHelpers'

export const eventFullSelectorAsync = atomFamily((id) =>
  atom(async () => {
    if (!id) return DEFAULT_EVENT
    const res = await getData('/api/events/' + id, {}, null, null, false)
    setAtomValue(isLoadedAtom('eventFullAtomAsync' + id), true)
    return res
  })
)

const eventFullAtomAsync = atomFamily((id) =>
  atomWithDefault((get) => get(eventFullSelectorAsync(id)))
)

export default eventFullAtomAsync
