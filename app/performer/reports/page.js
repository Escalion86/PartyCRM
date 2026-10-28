import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { uniquePartyCompanyMemberships } from '@helpers/uniquePartyCompanyMemberships'
import PartyReportReviewQueue from '@components/party/reports/PartyReportReviewQueue'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Проверка отчётов — PartyCRM' }

export default async function ReportReviewPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/performer/reports')
  const companies = uniquePartyCompanyMemberships(
    memberships.filter((membership) => membership.staff?.status === 'active')
  ).map((membership) => ({
    id: String(membership.tenantId),
    title: membership.company?.title || 'Компания',
  }))
  if (!companies.length) redirect('/party/entry')
  return <PartyReportReviewQueue companies={companies} />
}
