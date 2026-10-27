const providerError = (code, message, status = 502) => Object.assign(new Error(message), { status, code: `partycrm_provider_${code}` })
const safeText = (value, max = 180) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : ''
const sourceId = (value) => safeText(String(value ?? ''), 120)
const money = (value) => {
  const string = String(value ?? '')
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(string)) return null
  const [whole, fraction = ''] = string.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
const range = (payload, now) => {
  const values = ['dateFrom', 'dateTo'].map((key) => {
    const value = payload[key]
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) throw providerError('invalid_range', 'Укажите начало и конец периода с часовым поясом', 400)
    return new Date(value)
  })
  if (values[1] <= values[0] || values[1] - values[0] > 7 * 86400000) throw providerError('invalid_range', 'Период предпросмотра должен быть от одного момента до семи дней', 400)
  if (values[1] > now) throw providerError('invalid_range', 'Конец периода не может быть в будущем', 400)
  return values
}

// Only these code-built URLs can reach the transport. No user URLs or upstream
// pagination links are followed, and redirects cannot forward credentials.
export const createPartyTicketProviderTransport = ({ fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = 10000 } = {}) => {
  const request = async (provider, token, path, parameters = {}) => {
    const origin = provider === 'ticketscloud' ? 'https://ticketscloud.com' : 'https://api.evotor.ru'
    const url = new URL(path, origin)
    if (url.origin !== origin || !path.startsWith('/')) throw providerError('invalid_request', 'Недопустимый запрос к провайдеру', 400)
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url.toString(), { method: 'GET', headers: { Accept: 'application/json', ...(provider === 'ticketscloud' ? { Authorization: `key ${token}` } : { 'X-Authorization': token }) }, redirect: 'error', cache: 'no-store', signal: controller.signal })
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw providerError('unauthorized', 'Провайдер не принял токен или не разрешил чтение', 422)
        if (response.status === 429) throw providerError('rate_limited', 'Лимит запросов провайдера исчерпан. Повторите позже.', 429)
        throw providerError('unavailable', 'Провайдер не смог выполнить чтение. Повторите позже.')
      }
      const maxBytes = 2 * 1024 * 1024
      if (Number(response.headers?.get('content-length')) > maxBytes) throw providerError('response_too_large', 'Ответ слишком большой. Сократите период предпросмотра.')
      const chunks = []; let size = 0
      if (!response.body?.getReader) throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый ответ')
      const reader = response.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > maxBytes) { await reader.cancel(); throw providerError('response_too_large', 'Ответ слишком большой. Сократите период предпросмотра.') }
          chunks.push(Buffer.from(value))
        }
      } finally { reader.releaseLock() }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый ответ') }
    } catch (error) {
      if (error.code?.startsWith('partycrm_provider_')) throw error
      if (controller.signal.aborted) throw providerError('timeout', 'Провайдер не ответил вовремя. Повторите позже.', 504)
      throw providerError('unavailable', 'Не удалось связаться с провайдером. Повторите позже.')
    } finally { clearTimeout(timer) }
  }
  const stores = async (token) => {
    const result = await request('evotor', token, '/api/v1/inventories/stores/search')
    if (!Array.isArray(result)) throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый список магазинов')
    return result.slice(0, 200).map((store) => ({ id: sourceId(store.uuid), title: safeText(store.name) })).filter((store) => store.id)
  }
  return {
    async verify(provider, token) {
      if (provider === 'evotor') return { stores: await stores(token) }
      const response = await request('ticketscloud', token, '/v2/resources/orders', { page: '1', page_size: '1' })
      if (!Array.isArray(response?.data) || !response.pagination) throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый список заказов')
      return {}
    },
    async preview(provider, token, config, payload = {}) {
      const [from, to] = range(payload, now())
      if (provider === 'ticketscloud') {
        const page = payload.page ?? 1
        if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw providerError('invalid_page', 'Недопустимая страница', 400)
        const response = await request(provider, token, '/v2/resources/orders', { page: String(page), page_size: '40', created_at: `${from.toISOString()},${to.toISOString()}` })
        if (!Array.isArray(response?.data) || !response.pagination) throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый список заказов')
        const rows = response.data.slice(0, 40).map((order) => {
          const event = response.refs?.events?.[order.event]
          return { id: sourceId(order.id), code: sourceId(order.code), status: safeText(order.status, 40), eventId: sourceId(order.event), title: safeText(event?.title?.text), createdAtSource: safeText(order.created_at, 60), completedAtSource: safeText(order.done_at, 60), eventStartsAtSource: safeText(event?.lifetime?.start, 60), sourceTimeZone: safeText(event?.timezone, 80), quantity: Array.isArray(order.tickets) ? order.tickets.length : null, priceKopecks: money(order.values?.price), fullKopecks: money(order.values?.full) }
        })
        const total = Number(response.pagination.total)
        const nextPage = Number.isSafeInteger(total) && total >= 0 ? page * 40 < total ? page + 1 : null : rows.length === 40 ? page + 1 : null
        return { kind: 'orders', rows, page, nextPage, imported: false, financialEffect: false, availabilityKnown: false }
      }
      if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(config.storeUuid || '')) throw providerError('store_required', 'Сохраните идентификатор магазина Эвотор', 400)
      const oldest = new Date(now()); oldest.setUTCMonth(oldest.getUTCMonth() - 6)
      if (from < oldest) throw providerError('invalid_range', 'Эвотор предоставляет документы только за последние шесть месяцев', 400)
      const format = (value) => value.toISOString().replace('Z', '+0000')
      const response = await request(provider, token, `/api/v1/inventories/stores/${config.storeUuid}/documents`, { gtCloseDate: format(from), ltCloseDate: format(to), types: 'SELL,PAYBACK' })
      if (!Array.isArray(response)) throw providerError('invalid_response', 'Провайдер вернул неподдерживаемый список документов')
      const documents = response.filter((row) => ['SELL', 'PAYBACK'].includes(row.type))
      return { kind: 'receipts', rows: documents.slice(0, 200).map((row) => ({ id: sourceId(row.uuid), type: row.type, number: sourceId(row.number), closedAtSource: safeText(row.closeDate, 60), amountKopecks: money(row.closeResultSum), storeId: sourceId(row.storeUuid), deviceId: sourceId(row.deviceUuid) })), truncated: documents.length > 200, nextPage: null, imported: false, financialEffect: false }
    },
  }
}
