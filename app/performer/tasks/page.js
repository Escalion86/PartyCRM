import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import PartyTasksWorkspace from '@components/party/tasks/PartyTasksWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Задачи — PartyCRM' }
export default async function TasksPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/performer/tasks')
  const companies = memberships.filter((membership) => canPartyAccess({ ...membership, tenantId: membership.tenantId, staff: membership.staff, position: membership.position }, { resource: 'tasks' })).map((membership) => ({ id: String(membership.tenantId), title: membership.company?.title || 'Компания' }))
  return <PartyTasksWorkspace companies={companies} />
}
