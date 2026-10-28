import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { uniquePartyCompanyMemberships } from '@helpers/uniquePartyCompanyMemberships'
import PartyTicketingWorkspace from '@components/party/ticketing/PartyTicketingWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Билеты и посещения — PartyCRM' }

export default async function TicketingPage({ searchParams }) {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/performer/ticketing')
  const companies = uniquePartyCompanyMemberships(
    memberships.filter((membership) =>
      canPartyAccess(
        {
          tenantId: membership.tenantId,
          role: membership.role,
          staff: membership.staff,
          position: membership.position,
          company: membership.company,
        },
        { resource: 'tickets' }
      )
    )
  ).map((membership) => ({
    id: String(membership.tenantId),
    title: membership.company?.title || 'Компания',
    timeZone: membership.company?.settings?.timeZone || 'Asia/Krasnoyarsk',
  }))
  const query = await searchParams
  const initialCompanyId = companies.some(
    (company) => company.id === query?.companyId
  )
    ? query.companyId
    : ''
  const initialSessionId = /^[a-f\d]{24}$/i.test(query?.sessionId || '')
    ? query.sessionId
    : ''
  return (
    <PartyTicketingWorkspace
      companies={companies}
      initialSessionId={
        query?.companyId && !initialCompanyId ? '' : initialSessionId
      }
      initialCompanyId={initialCompanyId}
    />
  )
}
