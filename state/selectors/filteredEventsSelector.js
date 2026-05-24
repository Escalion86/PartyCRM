import { atom } from 'jotai'
import eventsAtom from '@state/atoms/eventsAtom'

const filteredEventsSelector = atom((get) => {
  const events = get(eventsAtom)
  return events.filter((event) => event?.showOnSite !== false)
})

export default filteredEventsSelector
