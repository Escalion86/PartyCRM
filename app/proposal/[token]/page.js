import { notFound } from 'next/navigation'
import { getPublicPartyProposal } from '@server/partyProposalPublications'
import PartyPublicProposal from './PartyPublicProposal'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Коммерческое предложение',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PartyProposalPage({ params }) {
  const { token } = await params
  const proposal = await getPublicPartyProposal(token)
  if (!proposal) notFound()

  return <PartyPublicProposal token={token} initialProposal={proposal} />
}
