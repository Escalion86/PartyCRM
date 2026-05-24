import { atom } from 'jotai'
import { DEFAULT_EVENT } from '@helpers/constants'
import eventFullAtomAsync from '@state/async/eventFullAtomAsync'
import eventsAtom from '@state/atoms/eventsAtom'

const eventEditSelector = atom(
  () => DEFAULT_EVENT,
  (get, set, newItem) => {
    const items = get(eventsAtom)
    if (!newItem?._id) return
    const findedItem = items.find((event) => event._id === newItem._id)
    if (findedItem) {
      const newItemsList = items.map((event) => {
        if (event._id === newItem._id) return newItem
        return event
      })
      set(eventFullAtomAsync(newItem._id), newItem)
      set(eventsAtom, newItemsList)
    } else {
      set(eventsAtom, [...items, newItem])
    }
  }
)

export default eventEditSelector
