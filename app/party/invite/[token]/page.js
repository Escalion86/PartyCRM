import PartyStaffInviteClient from './PartyStaffInviteClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Приглашение в PartyCRM',
  applicationName: 'PartyCRM',
  robots: { index: false, follow: false },
}

export default async function PartyStaffInvitePage({ params }) {
  const token = String((await params)?.token || '').trim()
  return <PartyStaffInviteClient token={token} />
}
