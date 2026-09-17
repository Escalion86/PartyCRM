import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { NextResponse } from 'next/server'
import { getPartyOrderModel, getPartyProposalModel, getPartyServiceModel } from '@server/partyModels'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { buildPartyProposalApplication } from '@helpers/partyProposalApply'
import { syncPartyOrderInventory } from '@server/partyInventory'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const errorResponse = (error) => partyError(error?.status || 500, error?.code || 'partycrm_proposal_apply_failed', error?.status ? error.message : 'Не удалось перенести КП в заказ', error?.status === 409 ? 'conflict' : 'validation')

export async function POST(req, { params }) {
  const access = await getPartyRequestContext({ req, managementOnly: true })
  if (access.error) return access.error
  const { context } = access
  const { access: tariff } = await getPartyCompanyTariffAccessState(context.company)
  if (!tariff.allowDocuments) return partyError(403, 'partycrm_documents_tariff_required', 'Коммерческие предложения недоступны на текущем тарифе', 'permission')
  const id = String((await params)?.id || '')
  if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_proposal_id', 'Некорректный id коммерческого предложения', 'validation')
  const body = await parseJsonBody(req)
  const expectedRevision = Number(body.expectedCommercialRevision)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return partyError(400, 'partycrm_order_revision_required', 'Обновите заказ перед переносом КП', 'validation')
  try {
    const Proposals = await getPartyProposalModel()
    const proposal = await Proposals.findOne({ _id: id, tenantId: context.tenantId }).lean()
    if (!proposal) return partyError(404, 'partycrm_proposal_not_found', 'Коммерческое предложение не найдено')
    if (proposal.status !== 'accepted') return partyError(409, 'partycrm_proposal_not_accepted', 'Сначала отметьте эту версию КП как принятую', 'conflict')
    const Orders = await getPartyOrderModel()
    const current = await Orders.findOne({ _id: proposal.orderId, tenantId: context.tenantId }).lean()
    if (!current) return partyError(404, 'partycrm_order_not_found', 'Заказ не найден')
    if (String(current.agreedProposal?.proposalId || '') === String(proposal._id)) return NextResponse.json({ success: true, data: { order: current, repeated: true, inventory: null } })
    if (['closed', 'canceled'].includes(current.status)) return partyError(409, 'partycrm_order_readonly', 'Закрытый или отменённый заказ нельзя менять', 'conflict')
    if (Number(current.commercialRevision || 0) !== expectedRevision) return partyError(409, 'partycrm_order_revision_conflict', 'Коммерческие условия заказа уже изменились. Обновите заказ.', 'conflict')
    const appliedAt = new Date()
    const application = buildPartyProposalApplication({ proposal, appliedAt, appliedByStaffId: context.staff?._id })
    const Services = await getPartyServiceModel()
    const referencedIds = [...new Set(application.orderItems.map((item) => String(item.serviceId || '')).filter(isValidObjectId))]
    const existingServices = referencedIds.length ? await Services.find({ _id: { $in: referencedIds }, tenantId: context.tenantId }).select('_id status').lean() : []
    const allowedIds = new Set(existingServices.filter((item) => item.status !== 'archived').map((item) => String(item._id)))
    const servicesIds = referencedIds.filter((serviceId) => allowedIds.has(serviceId))
    const revisionFilter = getPartyOrderWriteGuard(current)
    const order = await Orders.findOneAndUpdate(
      { _id: current._id, tenantId: context.tenantId, ...revisionFilter },
      { $set: { orderItems: application.orderItems, agreedProposal: application.agreedProposal, servicesIds, serviceTitle: application.serviceTitle, contractAmount: application.contractAmount, 'clientPayment.totalAmount': application.contractAmount }, $inc: { commercialRevision: 1 } },
      { returnDocument: 'after', runValidators: true }
    ).lean()
    if (!order) return partyError(409, 'partycrm_order_revision_conflict', 'Коммерческие условия заказа уже изменились. Обновите заказ.', 'conflict')
    const inventory = await syncPartyOrderInventory({ tenantId: context.tenantId, order, staffId: context.staff?._id })
    await recordPartyOrderAudit({ context, order, previousOrder: current, action: 'proposal_applied_to_order', summary: `Перенёс принятое КП №${proposal.number}, версия ${proposal.version}, в заказ`, metadata: { proposalId: String(proposal._id), proposalVersion: proposal.version } })
    await syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId: order._id, previousOrder: current })
    return NextResponse.json({ success: true, data: { order, repeated: false, inventory } })
  } catch (error) { return errorResponse(error) }
}
