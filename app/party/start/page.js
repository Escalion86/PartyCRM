import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { resolvePartyEntryPath } from '@server/partyEntry'
import PartyStartClient from './PartyStartClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'PartyCRM - выбор режима работы',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PartyStartPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    redirect('/party/login?callbackUrl=/party/start')
  }

  if ((sessionUser.interfaceRoles ?? []).length > 0) {
    redirect(resolvePartyEntryPath({ user: sessionUser, memberships }))
  }

  return (
    <main className="min-h-screen bg-[#eaf6ff] px-5 py-10 text-slate-950">
      <PartyStartClient
        user={{
          firstName: sessionUser.firstName || '',
          secondName: sessionUser.secondName || '',
        }}
      />
    </main>
  )
}
