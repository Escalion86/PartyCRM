import { notFound } from 'next/navigation'
import { getPublicPartyInvitation } from '@server/partyInvitations'
import PartyInvitationPage from '@components/party/invitations/PartyInvitationPage'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Приглашение на праздник',
  robots: { index: false, follow: false },
}
export default async function InvitationPage({ params }) {
  const { token } = await params
  const invitation = await getPublicPartyInvitation(token)
  if (!invitation) notFound()
  return <PartyInvitationPage invitation={invitation} />
}
