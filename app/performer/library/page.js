import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import PartyCreativeLibrary from '@components/party/reports/PartyCreativeLibrary'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Опыт команды — PartyCRM' }

export default async function CreativeLibraryPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/performer/library')
  const companies = memberships
    .filter(
      (membership) =>
        ['owner', 'admin', 'performer'].includes(membership.role) &&
        membership.status === 'active'
    )
    .map((membership) => ({
      id: String(membership.tenantId),
      title: membership.company?.title || 'Компания',
    }))
  if (!companies.length) redirect('/party/entry')
  return <PartyCreativeLibrary companies={companies} />
}
