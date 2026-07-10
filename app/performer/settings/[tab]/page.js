import { notFound, redirect } from 'next/navigation'
import PerformerSettingsPageContent from '../PerformerSettingsPageContent'
import { getPerformerSettingsTab } from '../performerSettingsTabs'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'

export const dynamic = 'force-dynamic'

export default async function PerformerSettingsTabPage({ params }) {
  const resolvedParams = await params
  const tab = getPerformerSettingsTab(resolvedParams?.tab)

  if (!tab) return notFound()
  if (tab === 'profile') redirect('/performer/settings')

  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect(`/party/login?callbackUrl=/performer/settings/${tab}`)
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUsePerformer) {
    redirect('/party/entry')
  }
  if (!state.performerReady) {
    redirect('/performer/master')
  }

  return <PerformerSettingsPageContent activeTab={tab} />
}
