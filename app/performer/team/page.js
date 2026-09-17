import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import PartyOrderTeamWorkspace from '@components/party/orders/PartyOrderTeamWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Команда заказов — PartyCRM' }

export default async function PerformerTeamPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/performer/team')
  const companies = Array.from(
    new Map(
      memberships
        .filter((membership) =>
          canPartyOperationalPermission(membership, 'orders.assignments')
        )
        .map((membership) => [
          String(membership.tenantId),
          {
            id: String(membership.tenantId),
            title: membership.company?.title || 'Компания',
          },
        ])
    ).values()
  )
  if (!companies.length) redirect('/performer')
  return <PartyOrderTeamWorkspace companies={companies} />
}
