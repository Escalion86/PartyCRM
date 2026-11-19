import { Types } from 'mongoose'
import { canPartyAccess } from '../helpers/partyRolePermissions'
import { ticketFailure, ticketId } from '../helpers/partyTicketsCore'
import {
  buildTicketChannelSummary,
  directTicketChannelPipeline,
  externalTicketChannelPipeline,
  normalizeTicketChannelRecord,
  ticketChannelIdentity,
  ticketChannelRecordDto,
} from '../helpers/partyTicketChannels'

const requireFinance = (context) => {
  if (!canPartyAccess(context, { resource: 'tickets.finance', action: 'read' })) {
    ticketFailure('Нет права просматривать сверку продаж по каналам', 403, 'partycrm_ticketing_forbidden')
  }
}

const duplicateReference = () => ticketFailure(
  'Операция с таким внешним номером уже записана в этом канале и сеансе',
  409,
  'partycrm_ticketing_channel_duplicate'
)

export const createPartyTicketChannels = ({ models, loadVisible, now }) => ({
  async record(context, payload, session, operationId) {
    requireFinance(context)
    const event = await loadVisible(models.Sessions, context, payload.sessionId, session)
    const input = normalizeTicketChannelRecord(payload, now())
    const filter = { tenantId: context.tenantId, sessionId: event._id }
    let channel, original = null
    if (input.kind === 'refund') {
      original = await loadVisible(models.ChannelRecords, context, payload.saleRecordId, session)
      if (original.kind !== 'sale' || String(original.sessionId) !== String(event._id)) {
        ticketFailure('Возврат должен относиться к продаже этого сеанса', 409)
      }
      if (+input.occurredAt < +new Date(original.occurredAt)) {
        ticketFailure('Дата возврата предшествует продаже')
      }
      if (input.quantity > original.quantity - original.refundedQuantity ||
          input.amountKopecks > original.amountKopecks - original.refundedAmountKopecks) {
        ticketFailure('Возврат превышает оставшееся количество или сумму продажи', 409, 'partycrm_ticketing_channel_refund_exceeded')
      }
      channel = { channelKey: original.channelKey, channelTitle: original.channelTitle }
      if (payload.channelTitle && ticketChannelIdentity(payload.channelTitle).channelKey !== channel.channelKey) {
        ticketFailure('Канал возврата должен совпадать с исходной продажей')
      }
    } else {
      if (payload.saleRecordId) ticketFailure('Для продажи не указывайте исходную запись возврата')
      channel = ticketChannelIdentity(payload.channelTitle)
    }
    if (input.externalReferenceKey) {
      const previous = await models.ChannelRecords.findOne({
        ...filter,
        channelKey: channel.channelKey,
        kind: input.kind,
        externalReferenceKey: input.externalReferenceKey,
      }).session(session).lean()
      if (previous) duplicateReference()
    }
    if (original) {
      const updated = await models.ChannelRecords.updateOne({
        ...filter,
        _id: original._id,
        kind: 'sale',
        refundedQuantity: original.refundedQuantity,
        refundedAmountKopecks: original.refundedAmountKopecks,
      }, {
        $inc: { refundedQuantity: input.quantity, refundedAmountKopecks: input.amountKopecks },
      }, { session, runValidators: true })
      if (updated.matchedCount !== 1) {
        ticketFailure('Остаток продажи изменился. Обновите сверку', 409, 'partycrm_ticketing_stale')
      }
    }
    try {
      const [record] = await models.ChannelRecords.create([{
        ...filter,
        programId: event.programId,
        locationId: event.locationId,
        operationId,
        ...channel,
        ...input,
        saleRecordId: original?._id || null,
        refundedQuantity: 0,
        refundedAmountKopecks: 0,
        recordedByStaffId: context.staff._id,
      }], { session, ordered: true })
      return { entity: 'channel_record', entityId: record._id }
    } catch (error) {
      if (error.code === 11000) duplicateReference()
      throw error
    }
  },

  async readRecord(context, id) {
    requireFinance(context)
    return ticketChannelRecordDto(await loadVisible(models.ChannelRecords, context, id))
  },

  async summary(context, params, visibleSales) {
    requireFinance(context)
    const event = await loadVisible(models.Sessions, context, params.get('sessionId'))
    const cursor = params.get('cursor') ? ticketId(params.get('cursor')) : null
    const filter = {
      tenantId: new Types.ObjectId(ticketId(context.tenantId)),
      sessionId: new Types.ObjectId(String(event._id)),
    }
    const [direct, external, records, recentSales] = await Promise.all([
      models.Sales.aggregate(directTicketChannelPipeline(filter)),
      models.ChannelRecords.aggregate(externalTicketChannelPipeline(filter)),
      models.ChannelRecords.find({
        tenantId: context.tenantId,
        sessionId: event._id,
        ...(cursor ? { _id: { $lt: cursor } } : {}),
      }).sort({ _id: -1 }).limit(41).lean(),
      models.ChannelRecords.find(visibleSales)
        .select('channelKey channelTitle -_id')
        .sort({ _id: -1 }).limit(50).lean(),
    ])
    const page = records.slice(0, 40)
    const suggested = new Map()
    for (const { channelKey, channelTitle } of recentSales) {
      if (!suggested.has(channelKey)) suggested.set(channelKey, { channelKey, channelTitle })
    }
    return { data: {
      ...buildTicketChannelSummary({ sessionId: event._id, capacity: event.capacity, direct: direct[0], external }),
      records: page.map(ticketChannelRecordDto),
      suggestedChannels: [...suggested.values()],
      meta: { hasMore: records.length > 40, nextCursor: records.length > 40 ? String(page.at(-1)._id) : null },
    } }
  },
})
