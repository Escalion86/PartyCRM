import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import InventoryWorkspace from '@components/party/inventory/InventoryWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Склад и реквизит — PartyCRM',
  robots: { index: false, follow: false },
}

export default async function InventoryPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/company/inventory')
  const allowed = memberships.filter(
    (membership) =>
      ['owner', 'admin'].includes(membership.role) &&
      (membership.status || membership.staff?.status || 'active') === 'active'
  )
  if (!allowed.length) redirect('/party/entry')
  return (
    <InventoryWorkspace
      companies={allowed.map((membership) => ({
        _id: String(membership.tenantId),
        title: membership.company?.title || 'Компания',
      }))}
    />
  )
}
