import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { uniquePartyCompanyMemberships } from '@helpers/uniquePartyCompanyMemberships'
import PartyRoleOrdersWorkspace from '@components/party/orders/PartyRoleOrdersWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Заказы — PartyCRM' }

export default async function WorkPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/performer/work')
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
        { resource: 'orders' }
      )
    )
  ).map((membership) => ({
    id: String(membership.tenantId),
    title: membership.company?.title || 'Компания',
  }))
  return <PartyRoleOrdersWorkspace companies={companies} />
}
