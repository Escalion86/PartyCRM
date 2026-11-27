import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { normalizePartyInboxTimeZone } from '../helpers/partyInboxSla.js'
import { partyDateAtTime } from '../helpers/partyWorkingSchedule.js'
import { getPartyOrderModel, getPartyProposalModel } from './partyModels'
import { isValidObjectId } from './partyApi'

const defaultValidityMs = 7 * 24 * 60 * 60 * 1000
const pendingStatuses = ['draft', 'sent']
const orderReadonlyStatuses = ['closed', 'canceled']
const orderFields = { tenantId: 1, status: 1, agreedProposal: 1, proposalPublication: 1 }
const publicProposalFields = 'number version senderSnapshot.displayName eventSnapshot.title eventSnapshot.date items subtotal discount total taxText paymentTerms includedText additionalTerms'

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code })
}

const signPublicId = (tenantId, publicId) => {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return createHmac('sha256', secret).update(`partycrm:proposal:${tenantId}:${publicId}`).digest('hex')
}

const getPublicPath = (tenantId, publicId) => `/proposal/${tenantId}.${publicId}.${signPublicId(tenantId, publicId)}`

const verifyToken = (token) => {
  if (!/^[a-f\d]{24}\.[a-f\d]{32}\.[a-f\d]{64}$/.test(token)) return null
  const [tenantId, publicId, signature] = token.split('.')
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(signPublicId(tenantId, publicId), 'hex'))
    ? { tenantId, publicId }
    : null
}

const includesVariant = (publication, proposalId) =>
  publication?.variantIds.some((id) => String(id) === String(proposalId)) === true

const isApplied = (order) => includesVariant(order.proposalPublication, order.agreedProposal?.proposalId)

const canRespond = (order, now) =>
  order.proposalPublication.validUntil > now &&
  !order.proposalPublication.lockedAt &&
  !orderReadonlyStatuses.includes(order.status) && !isApplied(order)

const getVariantExpiry = (validUntil, now, timeZone) => {
  if (!validUntil) return now.getTime() + defaultValidityMs
  const isoDate = validUntil.toISOString()
  // The editor stores date-only input as midnight UTC. Include the selected calendar day.
  if (isoDate.endsWith('T00:00:00.000Z')) {
    return partyDateAtTime(isoDate.slice(0, 10), '23:59', timeZone).getTime() + 59_999
  }
  return validUntil.getTime()
}

const findScopedOrder = (Orders, filter) => Orders.findOne(filter).select(orderFields)

const withPublicationTransaction = async (work) => {
  const [Orders, Proposals] = await Promise.all([getPartyOrderModel(), getPartyProposalModel()])
  const session = await Orders.db.startSession()
  try {
    return await session.withTransaction(() => work({ Orders, Proposals, session }))
  } finally {
    await session.endSession()
  }
}

export const listPartyProposalsWithPublication = async ({ tenantId, orderId }) => {
  const [Orders, Proposals] = await Promise.all([getPartyOrderModel(), getPartyProposalModel()])
  const scope = { tenantId, orderId }
  const [order, proposals] = await Promise.all([
    findScopedOrder(Orders, { tenantId, _id: orderId }).lean(),
    Proposals.find(scope).sort({ createdAt: -1, _id: -1 }).lean(),
  ])
  const publication = order?.proposalPublication
  if (!publication) return proposals

  const metadata = {
    publicPath: getPublicPath(tenantId, publication.publicId),
    publicVariantIds: publication.variantIds,
    publicValidUntil: publication.validUntil,
    publicDecision: publication.decision,
    publicCanRespond: canRespond(order, new Date()),
  }
  return proposals.map((proposal) => includesVariant(publication, proposal._id)
    ? { ...proposal, ...metadata }
    : proposal)
}

const readVariantIds = (proposalId, requestedIds) => {
  const variantIds = requestedIds === undefined ? [proposalId] : requestedIds
  if (!Array.isArray(variantIds) || variantIds.length < 1 || variantIds.length > 6 ||
      variantIds.some((id) => typeof id !== 'string' || !isValidObjectId(id))) {
    fail(400, 'partycrm_invalid_proposal_variants', 'Выберите от одной до шести версий КП')
  }
  const normalized = variantIds.map((id) => id.toLowerCase())
  if (!normalized.includes(proposalId) || new Set(normalized).size !== normalized.length) {
    fail(400, 'partycrm_invalid_proposal_variants', 'Укажите разные версии КП, включая основную')
  }
  return normalized
}

export const changePartyProposalPublication = async ({ tenantId, proposalId, requestedIds, publish, companyTimeZone }) => {
  const variantIds = publish ? readVariantIds(proposalId, requestedIds) : []
  const publicId = publish ? randomBytes(16).toString('hex') : ''
  if (publish) signPublicId(tenantId, publicId)
  const timeZone = normalizePartyInboxTimeZone(companyTimeZone)

  const orderId = await withPublicationTransaction(async ({ Orders, Proposals, session }) => {
    const anchor = await Proposals.findOne({ tenantId, _id: proposalId }).select('orderId').session(session).lean()
    if (!anchor) fail(404, 'partycrm_proposal_not_found', 'Коммерческое предложение не найдено')
    const orderScope = { tenantId, _id: anchor.orderId }
    const order = await findScopedOrder(Orders, orderScope).session(session).lean()
    if (!order) fail(404, 'partycrm_order_not_found', 'Заказ не найден')
    const proposalScope = { tenantId, orderId: order._id }
    const publication = order.proposalPublication

    if (!publish) {
      if (!publication) return order._id
      if (!includesVariant(publication, proposalId)) fail(404, 'partycrm_proposal_not_published', 'Эта версия КП не опубликована')
      await Orders.updateOne(orderScope, { $unset: { proposalPublication: '' } }, { session })
      await Proposals.updateMany(
        { ...proposalScope, sharedPublicationId: publication.publicId },
        { $unset: { sharedPublicationId: '' } },
        { session }
      )
      return order._id
    }

    if (orderReadonlyStatuses.includes(order.status)) {
      fail(409, 'partycrm_order_readonly', 'Закрытый или отменённый заказ нельзя опубликовать')
    }
    if (publication) {
      if (publication.variantIds.map(String).join(',') === variantIds.join(',')) return order._id
      fail(409, 'partycrm_proposal_already_published', 'Закройте действующую ссылку, чтобы опубликовать другие варианты')
    }

    const variants = await Proposals.find({ ...proposalScope, _id: { $in: variantIds } })
      .select('status validUntil').session(session).lean()
    if (variants.length !== variantIds.length) fail(404, 'partycrm_proposal_variant_not_found', 'Версии КП должны принадлежать этому заказу')
    if (variants.some(({ status }) => !pendingStatuses.includes(status))) {
      fail(409, 'partycrm_proposal_variant_decided', 'Для публикации выберите черновики или отправленные версии без ответа')
    }
    const now = new Date()
    const validUntil = new Date(Math.min(...variants.map((variant) => getVariantExpiry(variant.validUntil, now, timeZone))))
    if (validUntil <= now) fail(409, 'partycrm_proposal_expired', 'Срок действия одной из версий истёк')

    await Orders.updateOne(orderScope, { $set: { proposalPublication: { publicId, variantIds, validUntil, timeZone } } }, { session })
    await Proposals.updateMany(
      { ...proposalScope, _id: { $in: variantIds } },
      { $set: { status: 'sent', sentAt: now, acceptedAt: null, rejectedAt: null, sharedPublicationId: publicId } },
      { session }
    )
    return order._id
  })

  return listPartyProposalsWithPublication({ tenantId, orderId })
}

const loadPublicOrder = async (Orders, { tenantId, publicId }, session = null) =>
  findScopedOrder(Orders, { tenantId, 'proposalPublication.publicId': publicId, status: { $ne: 'canceled' } })
    .session(session).lean()

const projectPublicVariant = (proposal) => ({
  number: proposal.number,
  version: proposal.version,
  items: proposal.items.map(({ title, description, quantity, unit, durationMinutes, unitPrice, discount, total }) => ({
    title, description, quantity, unit, durationMinutes, unitPrice, discount, total,
  })),
  subtotal: proposal.subtotal,
  discount: proposal.discount,
  total: proposal.total,
  taxText: proposal.taxText,
  paymentTerms: proposal.paymentTerms,
  includedText: proposal.includedText,
  additionalTerms: proposal.additionalTerms,
})

const loadPublicSnapshot = async (Proposals, order, session = null) => {
  const publication = order.proposalPublication
  const records = await Proposals.find({
    tenantId: order.tenantId,
    orderId: order._id,
    _id: { $in: publication.variantIds },
  }).select(publicProposalFields).session(session).lean()
  if (records.length !== publication.variantIds.length) return null

  const byId = new Map(records.map((proposal) => [String(proposal._id), proposal]))
  const variants = publication.variantIds.map((id) => byId.get(String(id)))
  const [first] = variants
  const selectedVariant = publication.variantIds.findIndex((id) => String(id) === String(publication.selectedProposalId))
  return {
    companyName: first.senderSnapshot?.displayName || '',
    eventTitle: first.eventSnapshot?.title || '',
    eventDate: first.eventSnapshot?.date?.toISOString() || '',
    validUntil: publication.validUntil.toISOString(),
    timeZone: publication.timeZone,
    decision: publication.decision,
    selectedVariant: selectedVariant < 0 ? null : selectedVariant,
    revision: publication.revision,
    canRespond: canRespond(order, new Date()),
    variants: variants.map(projectPublicVariant),
  }
}

export const getPublicPartyProposal = async (token) => {
  const scope = verifyToken(token)
  if (!scope) return null
  const [Orders, Proposals] = await Promise.all([getPartyOrderModel(), getPartyProposalModel()])
  const order = await loadPublicOrder(Orders, scope)
  return order ? loadPublicSnapshot(Proposals, order) : null
}

export const answerPublicPartyProposal = async (token, { action, variant, revision }) => {
  const scope = verifyToken(token)
  if (!scope) return null
  if (!['accept', 'reject', 'reset'].includes(action) || !Number.isSafeInteger(revision) || revision < 0) {
    fail(400, 'partycrm_invalid_proposal_answer', 'Выберите вариант или действие с предложением')
  }

  return withPublicationTransaction(async ({ Orders, Proposals, session }) => {
    const order = await loadPublicOrder(Orders, scope, session)
    if (!order) return null
    const now = new Date()
    if (!canRespond(order, now)) fail(409, 'partycrm_proposal_reply_closed', 'Приём ответов на это предложение завершён')
    const publication = order.proposalPublication
    if (revision !== publication.revision) fail(409, 'partycrm_proposal_reply_conflict', 'Ответ уже изменился. Обновите страницу')
    if (action === 'accept' && (!Number.isSafeInteger(variant) || variant < 0 || variant >= publication.variantIds.length)) {
      fail(400, 'partycrm_invalid_proposal_variant', 'Выберите один из предложенных вариантов')
    }
    const selectedProposalId = action === 'accept' ? publication.variantIds[variant] : null
    const decision = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : ''
    if (publication.decision === decision && String(publication.selectedProposalId) === String(selectedProposalId)) {
      return loadPublicSnapshot(Proposals, order, session)
    }

    const tenantId = order.tenantId
    const proposalScope = { tenantId, orderId: order._id, sharedPublicationId: scope.publicId }
    const nextPublication = { ...publication, decision, selectedProposalId, revision: revision + 1 }
    await Orders.updateOne({ tenantId, _id: order._id }, { $set: { proposalPublication: nextPublication } }, { session })
    await Proposals.updateMany(proposalScope, { $set: {
      status: decision === 'rejected' ? 'rejected' : 'sent',
      acceptedAt: null,
      rejectedAt: decision === 'rejected' ? now : null,
    } }, { session })
    if (selectedProposalId) {
      await Proposals.updateOne({ ...proposalScope, _id: selectedProposalId }, {
        $set: { status: 'accepted', acceptedAt: now },
      }, { session })
    }
    return loadPublicSnapshot(Proposals, { ...order, proposalPublication: nextPublication }, session)
  })
}
