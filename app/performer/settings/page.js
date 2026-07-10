import { redirect } from 'next/navigation'
import PerformerSettingsPageContent from './PerformerSettingsPageContent'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'

export const metadata = {
  title: 'PartyCRM - настройки кабинета исполнителя',
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

export default async function PerformerSettingsPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/performer/settings')
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUsePerformer) {
    redirect('/party/entry')
  }
  if (!state.performerReady) {
    redirect('/performer/master')
  }

  return <PerformerSettingsPageContent activeTab="profile" />
}
