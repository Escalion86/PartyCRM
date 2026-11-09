import { isPartyRestrictedManagementContext } from '@helpers/partyRolePermissions'
import { resolvePartyInboxOrderId } from '@helpers/partyInboxCore'
import { isValidObjectId, PARTY_MANAGEMENT_ROLES } from './partyApi'
import getPartyCompanyTariffAccessState from './getPartyCompanyTariffAccess'
import { partyInboxSources } from './partyInbox'
import { getPartyInboxStateModel } from './partyInboxModels'

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code })
}

const alreadyLinked = () => fail(409, 'inbox_order_already_linked', 'К обращению уже привязан заказ. Обновите входящие и откройте его.')

export async function preparePartyInboxOrderLink({ context, inboxId }) {
  if (!PARTY_MANAGEMENT_ROLES.includes(context.role) || isPartyRestrictedManagementContext(context)) {
    fail(403, 'partycrm_forbidden', 'Нет доступа к оформлению заказа из входящих')
  }
  const [channel, sourceId, extra] = typeof inboxId === 'string' ? inboxId.split(':') : []
  if (!['vk', 'avito', 'telegram'].includes(channel) || !isValidObjectId(sourceId) || extra !== undefined) {
    fail(400, 'invalid_inbox_id', 'Некорректное обращение для оформления заказа')
  }
  if (channel === 'telegram') {
    const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
    if (!tariff.access?.allowTelegramIntegration) fail(403, 'telegram_tariff_required', 'Telegram недоступен на текущем тарифе')
  }

  const Source = await partyInboxSources[channel].source()
  const State = await getPartyInboxStateModel()
  await State.init()
  const key = { tenantId: context.tenantId, channel, sourceId }
  return async (order, session) => {
    const source = await Source.findOne({ tenantId: context.tenantId, _id: sourceId }).select('clientId orderId').session(session).lean()
    if (!source) fail(404, 'inbox_not_found', 'Обращение не найдено')
    const current = await State.findOne(key).select('clientId orderId').session(session).lean()
    if (resolvePartyInboxOrderId(current, source)) alreadyLinked()
    const clientId = (current ? current.clientId : source.clientId) || order.clientId || null
    try {
      await State.updateOne(
        { ...key, orderId: null },
        { $set: { orderId: order._id, clientId, updatedByStaffId: context.staff._id }, $inc: { revision: 1 } },
        { session, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      )
    } catch (cause) {
      if (cause?.code === 11000) fail(409, 'inbox_state_conflict', 'Обращение изменилось. Обновите входящие и повторите действие.')
      throw cause
    }
  }
}
