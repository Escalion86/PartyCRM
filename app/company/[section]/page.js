import { notFound, redirect } from 'next/navigation'
import CompanyPageShell from '../CompanyPageShell'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'

const sectionTitles = {
  orders: 'Заказы',
  'orders-past': 'Прошедшие заказы',
  calls: 'Звонки',
  clients: 'Клиенты',
  finance: 'Финансы',
  services: 'Услуги',
  locations: 'Точки',
  staff: 'Сотрудники',
}

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

export default async function CompanySectionPage({ params }) {
  const resolvedParams = await params
  const section = resolvedParams?.section

  if (!sectionTitles[section]) return notFound()

  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect(`/party/login?callbackUrl=/company/${section}`)
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUseCompany) {
    redirect('/party/entry')
  }
  if (!state.companyReady) {
    redirect('/company/master')
  }

  return <CompanyPageShell section={section} />
}
