import { notFound, redirect } from 'next/navigation'
import CompanySettingsPageContent from '../CompanySettingsPageContent'
import {
  canAccessCompanySettingsTab,
  getCompanySettingsTab,
} from '../companySettingsTabs'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'

export const dynamic = 'force-dynamic'

export default async function CompanySettingsTabPage({ params }) {
  const resolvedParams = await params
  const tab = getCompanySettingsTab(resolvedParams?.tab)

  if (!tab) return notFound()
  if (tab === 'general') {
    redirect('/company/settings')
  }

  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect(`/party/login?callbackUrl=/company/settings/${tab}`)
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) {
    redirect('/party/entry')
  }
  if (!state.companyReady) {
    redirect('/company/master')
  }
  const managementMemberships = memberships.filter((membership) =>
    ['owner', 'admin'].includes(membership.role) &&
    (membership.status || membership.staff?.status || 'active') === 'active'
  )
  const managementMembership = managementMemberships[0]
  if (
    !canAccessCompanySettingsTab(tab, {
      companyRole: managementMembership?.role,
      isCompanyManager: managementMembership?.isAdmin,
    })
  ) {
    redirect('/company/settings')
  }

  const companies = managementMemberships.map((membership) => ({ id: String(membership.tenantId), title: membership.company?.title || 'Компания' }))
  return <CompanySettingsPageContent activeTab={tab} companies={companies} />
}
