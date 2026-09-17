import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyOperationalPermission } from '@helpers/partyOperationalPermissions'
import PartyOrderPricingWorkspace from '@components/party/orders/PartyOrderPricingWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Стоимость заказов — PartyCRM' }

export default async function PerformerPricingPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/performer/pricing')
  const companies = Array.from(
    new Map(
      memberships
        .filter((membership) =>
          canPartyOperationalPermission(membership, 'orders.pricing')
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
  return <PartyOrderPricingWorkspace companies={companies} />
}
