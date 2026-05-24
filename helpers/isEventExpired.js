import getDiffBetweenDates from './getDiffBetweenDates'
import serverSettingsAtom from '@state/atoms/serverSettingsAtom'
import { getAtomValue } from '@state/storeHelpers'

const isEventExpired = (event) => {
  const serverDate = new Date(getAtomValue(serverSettingsAtom)?.dateTime)
  return getDiffBetweenDates(event?.dateEnd, serverDate) >= 0
}

export default isEventExpired
