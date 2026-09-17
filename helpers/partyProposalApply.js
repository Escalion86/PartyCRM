import crypto from 'node:crypto'
import { calculatePartyProposalItem } from './partyProposalCore.js'

const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max)
const money = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100)

export const buildPartyOrderItemsFromProposal = (proposal = {}) =>
  (Array.isArray(proposal.items) ? proposal.items : [])
    .map(calculatePartyProposalItem)
    .filter((item) => item.title)

export const buildPartyProposalApplication = ({ proposal, appliedAt, appliedByStaffId }) => {
  const orderItems = buildPartyOrderItemsFromProposal(proposal)
  const snapshotHash = crypto.createHash('sha256').update(JSON.stringify({
    proposalId: String(proposal?._id || ''), version: Number(proposal?.version || 0),
    items: orderItems, total: money(proposal?.total),
  })).digest('hex')
  return {
    orderItems,
    contractAmount: money(proposal?.total),
    serviceTitle: orderItems.map((item) => item.title).join(', ').slice(0, 180),
    agreedProposal: {
      proposalId: proposal?._id || null,
      number: text(proposal?.number, 80),
      version: Number(proposal?.version || 0),
      subtotal: money(proposal?.subtotal),
      discount: money(proposal?.discount),
      total: money(proposal?.total),
      appliedAt,
      appliedByStaffId: appliedByStaffId || null,
      snapshotHash,
    },
  }
}
