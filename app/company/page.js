import { redirect } from 'next/navigation'
import CompanyPageShell from './CompanyPageShell'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState, resolvePartyEntryPath } from '@server/partyEntry'

export const metadata = {
  title: 'PartyCRM - кабинет компании',
  applicationName: 'PartyCRM',
  manifest: '/manifest.json?v=2026-05-27-logo-png',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PartyCRM',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = 'force-dynamic'

export default async function CompanyPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/company')
  }
  const entryPath = resolvePartyEntryPath({ user: sessionUser, memberships })
  if (['/performer/work', '/performer/tasks'].includes(entryPath)) redirect(entryPath)

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) {
    redirect('/party/entry')
  }
  if (!state.companyReady) {
    redirect('/company/master')
  }

  return <CompanyPageShell section="overview" />
}
