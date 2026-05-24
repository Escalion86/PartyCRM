import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { resolvePartyEntryPath } from '@server/partyEntry'

export const dynamic = 'force-dynamic'

export default async function PartyEntryPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/party/entry')
  }

  redirect(resolvePartyEntryPath({ user: sessionUser, memberships }))
}
