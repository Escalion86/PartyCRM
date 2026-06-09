import { redirect } from 'next/navigation'
import CompanySettingsPageContent from './CompanySettingsPageContent'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'
import { canAccessCompanySettingsTab } from './companySettingsTabs'

export const metadata = {
  title: 'PartyCRM - настройки компании',
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

export default async function CompanySettingsPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/company/settings')
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) {
    redirect('/party/entry')
  }
  if (!state.companyReady) {
    redirect('/company/master')
  }
  if (
    !canAccessCompanySettingsTab('general', {
      globalRole: sessionUser.role,
      isCompanyManager: state.companyReady,
    })
  ) {
    redirect('/company')
  }

  return <CompanySettingsPageContent activeTab="general" />
}
