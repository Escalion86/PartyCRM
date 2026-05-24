import { atom } from 'jotai'
import eventsAtom from '@state/atoms/eventsAtom'
import { getAdditionalEventsSummary } from '@helpers/additionalEvents'

export const additionalEventsOverdueCountAtom = atom((get) => {
  const events = get(eventsAtom)
  const summary = getAdditionalEventsSummary(events)
  return Number(summary?.overdue || 0)
})

export default additionalEventsOverdueCountAtom
