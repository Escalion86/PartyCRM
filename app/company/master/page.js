import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'
import CompanyMasterClient from './CompanyMasterClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'PartyCRM - мастер настройки компании',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function CompanyMasterPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/company/master')
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) {
    redirect('/party/entry')
  }
  if (state.companyReady) {
    redirect('/company')
  }

  return (
    <CompanyMasterClient
      user={{
        firstName: sessionUser.firstName || '',
        secondName: sessionUser.secondName || '',
      }}
    />
  )
}
