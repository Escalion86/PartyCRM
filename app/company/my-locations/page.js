import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import PartyLocationWorkspace from '@components/party/locations/PartyLocationWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Мои площадки — PartyCRM' }

export default async function MyLocationsPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/company/my-locations')
  const companies = memberships
    .filter(
      (membership) =>
        membership.role === 'location_owner' && membership.status === 'active'
    )
    .map((membership) => ({
      id: String(membership.tenantId),
      title: membership.company?.title || 'Компания',
    }))
  if (!companies.length) redirect('/party/entry')
  return <PartyLocationWorkspace companies={companies} />
}
