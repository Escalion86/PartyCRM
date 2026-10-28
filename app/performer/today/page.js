import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyTodayAccess } from '@helpers/partyToday'
import { uniquePartyCompanyMemberships } from '@helpers/uniquePartyCompanyMemberships'
import PartyTodayWorkspace from '@components/party/today/PartyTodayWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Сегодня — PartyCRM' }

export default async function TodayPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/performer/today')
  const companies = uniquePartyCompanyMemberships(
    memberships.filter((membership) =>
      canPartyTodayAccess({
        tenantId: membership.tenantId,
        role: membership.role,
        staff: membership.staff,
        position: membership.position,
        company: membership.company,
      })
    )
  ).map((membership) => ({
    id: String(membership.tenantId),
    title: membership.company?.title || 'Компания',
  }))
  if (!companies.length) redirect('/party/entry')
  return <PartyTodayWorkspace companies={companies} />
}
