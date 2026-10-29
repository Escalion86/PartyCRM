import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyResourceCalendarAccess } from '@helpers/partyResourceCalendar'
import { uniquePartyCompanyMemberships } from '@helpers/uniquePartyCompanyMemberships'
import PartyResourceCalendarWorkspace from '@components/party/resources/PartyResourceCalendarWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Календарь ресурсов — PartyCRM' }

export default async function ResourceCalendarPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id)
    redirect('/party/login?callbackUrl=/performer/resources')
  const accessFor = (membership) =>
    getPartyResourceCalendarAccess({
      tenantId: membership.tenantId,
      role: membership.role,
      staff: membership.staff,
      position: membership.position,
      company: membership.company,
    })
  const companies = uniquePartyCompanyMemberships(
    memberships.filter((membership) => accessFor(membership).allowed)
  ).map((membership) => ({
    id: String(membership.tenantId),
    title: membership.company?.title || 'Компания',
    timeZone: membership.company?.settings?.timeZone || 'Europe/Moscow',
    preferenceId: String(membership.staff?._id || sessionUser._id),
    resourceTypes: accessFor(membership).types,
    accessVersion: createHash('sha256')
      .update(
        JSON.stringify({
          role: membership.role,
          staff: {
            status: membership.staff?.status,
            positionId: membership.staff?.positionId,
            locationIds: membership.staff?.locationIds,
          },
          position: membership.position,
          companyUpdatedAt: membership.company?.updatedAt,
        })
      )
      .digest('hex'),
  }))
  if (!companies.length) redirect('/party/entry')
  return <PartyResourceCalendarWorkspace companies={companies} />
}
