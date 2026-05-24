import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'
import PerformerMasterClient from './PerformerMasterClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'PartyCRM - мастер настройки исполнителя',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PerformerMasterPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/performer/master')
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUsePerformer) {
    redirect('/party/entry')
  }
  if (state.performerReady) {
    redirect('/performer')
  }

  return (
    <PerformerMasterClient
      user={{
        firstName: sessionUser.firstName || '',
        secondName: sessionUser.secondName || '',
      }}
    />
  )
}
