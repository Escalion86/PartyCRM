import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import PartyInboxClient from '@components/party/inbox/PartyInboxClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Входящие — PartyCRM' }

export default async function InboxPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/company/inbox')
  const companies = memberships.filter((item) => ['owner', 'admin'].includes(item.role) && (item.status || item.staff?.status || 'active') === 'active')
    .map((item) => ({
      id: String(item.tenantId),
      title: item.company?.title || 'Компания',
      staffId: String(item.staffId || ''),
    }))
  if (!companies.length) redirect('/party/entry')
  return <PartyInboxClient companies={companies} />
}
