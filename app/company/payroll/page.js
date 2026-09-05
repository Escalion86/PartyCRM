import { redirect } from 'next/navigation'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import PartyPayrollWorkspace from '@components/party/finance/PartyPayrollWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Ведомости выплат — PartyCRM',
  robots: { index: false, follow: false },
}

export default async function PayrollPage() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) redirect('/party/login?callbackUrl=/company/payroll')
  const companies = memberships
    .filter(
      (membership) =>
        ['owner', 'admin'].includes(membership.role) &&
        (membership.status || membership.staff?.status || 'active') === 'active'
    )
    .map((membership) => ({
      id: String(membership.tenantId),
      title: membership.company?.title || 'Компания',
    }))
  if (!companies.length) redirect('/party/entry')
  return <PartyPayrollWorkspace companies={companies} />
}
