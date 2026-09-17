import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import PartyInventoryOperatorWorkspace from '@components/party/inventory/PartyInventoryOperatorWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Выдача и возврат реквизита — PartyCRM' }

export default async function PerformerInventoryPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/performer/inventory')
  const permittedMemberships = memberships
    .filter((membership) =>
      canPartyOperationalPermission(membership, 'inventory.movements')
    )
  const companies = Array.from(
    new Map(
      permittedMemberships.map((membership) => [
        String(membership.tenantId),
        {
          id: String(membership.tenantId),
          title: membership.company?.title || 'Компания',
        },
      ])
    ).values()
  )
  if (!companies.length) redirect('/performer')
  return <PartyInventoryOperatorWorkspace companies={companies} />
}
