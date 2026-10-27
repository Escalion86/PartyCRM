import { isPartyRestrictedManagementContext } from '../helpers/partyRolePermissions'
import { getPartyTicketProviderModel } from './partyTicketProvidersModel'
import { decryptPartyProviderToken, encryptPartyProviderToken, isPartyProviderEncryptionReady } from './partyTicketProvidersCrypto'
import { createPartyTicketProviderTransport } from './partyTicketProvidersTransport'

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code: `partycrm_provider_${code}` }) }
const definitions = {
  ticketscloud: { title: 'Ticketscloud', capabilities: { verify: true, readOrders: true, preview: true, readAvailability: false, reserve: false, sell: false, refund: false }, limitation: 'Предпросмотр заказов. Каталог gRPC и общий остаток не подключены; продажи и бронирования во внешнем пуле недоступны.' },
  evotor: { title: 'Эвотор', capabilities: { verify: true, readReceipts: true, preview: true, terminalCommands: false, payment: false, fiscalize: false }, limitation: 'Чтение магазинов и документов SELL/PAYBACK из облака. Чек не подтверждает зачисление денег; команды терминалу и фискализация недоступны.' },
  krasbilet: { title: 'Красбилет', capabilities: { verify: false, preview: false, sell: false, reserve: false }, limitation: 'Ожидаем партнёрскую документацию и условия доступа к API.' },
}
const metadata = (provider, row) => ({ provider, ...definitions[provider], configured: row?.configured === true, status: row?.status || 'unconfigured', storeUuid: row?.storeUuid || '', revision: row?.revision || 0, lastCheckedAt: row?.lastCheckedAt || null, lastErrorCode: row?.lastErrorCode || '' })
const guard = (context) => {
  if (!context?.tenantId || !context.staff || !['owner', 'admin'].includes(context.role) || isPartyRestrictedManagementContext(context)) fail(403, 'forbidden', 'Подключения доступны владельцу или администратору без ограничений')
}
const revision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'invalid_revision', 'Обновите состояние подключения и повторите действие')
  return value
}
const cleanToken = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value.trim())) fail(400, 'invalid_token', 'Введите токен без пробелов и переносов строк')
  return value.trim()
}

export const createPartyTicketProviderService = ({ loadModel = getPartyTicketProviderModel, transport = createPartyTicketProviderTransport(), secret, now = () => new Date() } = {}) => {
  const list = async (context) => {
    guard(context)
    const Model = await loadModel(), rows = await Model.find({ tenantId: context.tenantId }).lean()
    return { encryptionReady: isPartyProviderEncryptionReady(secret), providers: Object.keys(definitions).map((provider) => metadata(provider, rows.find((row) => row.provider === provider))) }
  }
  const mutate = async (context, body = {}) => {
    guard(context)
    const { action, provider } = body
    if (!['ticketscloud', 'evotor'].includes(provider)) fail(400, 'unsupported', 'Для этого сервиса подключение ещё недоступно')
    if (!['save', 'disconnect', 'test', 'preview'].includes(action)) fail(400, 'invalid_action', 'Недопустимое действие с подключением')
    const expectedRevision = revision(body.expectedRevision)
    const Model = await loadModel()
    if (action === 'save') await Model.init()
    const filter = { tenantId: context.tenantId, provider }
    const current = await Model.findOne(filter).select('+credential').lean()
    if ((current?.revision || 0) !== expectedRevision) fail(409, 'changed', 'Подключение изменилось. Обновите состояние и повторите действие.')
    if (action === 'save') {
      let credential = current?.credential
      if (body.token !== undefined && body.token !== '') credential = encryptPartyProviderToken(cleanToken(body.token), { tenantId: context.tenantId, provider, secret })
      if (!credential) fail(400, 'token_required', 'Введите токен подключения')
      let storeUuid = ''
      if (provider === 'evotor') {
        if (typeof body.storeUuid !== 'string') fail(400, 'invalid_store', 'Проверьте идентификатор магазина')
        storeUuid = body.storeUuid.trim()
        if (storeUuid && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(storeUuid)) fail(400, 'invalid_store', 'Идентификатор магазина должен быть UUID из Эвотора')
      }
      const next = { credential, storeUuid, configured: true, status: 'unchecked', lastCheckedAt: null, lastErrorCode: '', revision: expectedRevision + 1 }
      try {
        const result = await Model.updateOne(current ? { ...filter, revision: expectedRevision } : { ...filter, revision: { $exists: false } }, { $set: next }, { upsert: !current })
        if (!result.matchedCount && !result.upsertedCount) fail(409, 'changed', 'Подключение изменилось. Обновите состояние и повторите действие.')
      } catch (error) { if (error.code === 11000) fail(409, 'changed', 'Подключение изменилось. Обновите состояние и повторите действие.'); throw error }
      return { connection: metadata(provider, next) }
    }
    if (action === 'disconnect') {
      if (!current) return { connection: metadata(provider) }
      const next = { credential: null, configured: false, storeUuid: '', status: 'unconfigured', lastCheckedAt: null, lastErrorCode: '', revision: expectedRevision + 1 }
      const result = await Model.updateOne({ ...filter, revision: expectedRevision }, { $set: next })
      if (!result.matchedCount) fail(409, 'changed', 'Подключение изменилось. Обновите состояние и повторите действие.')
      return { connection: metadata(provider, next) }
    }
    if (!current?.configured || !current.credential) fail(409, 'not_configured', 'Сначала сохраните токен подключения')
    const token = decryptPartyProviderToken(current.credential, { tenantId: context.tenantId, provider, secret })
    if (action === 'preview') return { preview: await transport.preview(provider, token, { storeUuid: current.storeUuid }, body.payload || {}) }
    try {
      const result = await transport.verify(provider, token)
      const next = { status: 'verified', lastCheckedAt: now(), lastErrorCode: '' }
      const updated = await Model.updateOne({ ...filter, revision: expectedRevision }, { $set: next })
      if (!updated.matchedCount) fail(409, 'changed', 'Подключение изменилось во время проверки. Повторите проверку.')
      return { connection: metadata(provider, { ...current, ...next }), stores: result.stores || [] }
    } catch (error) {
      if (error.code?.startsWith('partycrm_provider_') && error.code !== 'partycrm_provider_changed') await Model.updateOne({ ...filter, revision: expectedRevision }, { $set: { status: 'error', lastCheckedAt: now(), lastErrorCode: error.code } })
      throw error
    }
  }
  return { list, mutate }
}
