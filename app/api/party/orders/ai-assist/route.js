import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  partyError,
  isValidObjectId,
} from '@server/partyApi'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyServiceModel,
  getPartyOrderModel,
} from '@server/partyModels'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { preparePartyOrderAi } from '@server/partyOrderAi'
import { transcribeAudioBlob } from '@server/callTranscription'
import { PARTY_AI_FIELDS } from '@helpers/partyOrderAi.mjs'

export const runtime = 'nodejs'
const MAX_BYTES = 10 * 1024 * 1024
async function boundedBody(req) {
  const reader = req.body?.getReader()
  if (!reader) throw new Error('EMPTY_BODY')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) {
        await reader.cancel()
        throw new Error('BODY_TOO_LARGE')
      }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks)
  } finally {
    reader.releaseLock()
  }
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const { company, access } = await getPartyCompanyTariffAccessState(
    context.tenantId
  )
  if (!access.allowAi)
    return partyError(
      403,
      'ai_unavailable',
      'ИИ недоступен на тарифе компании',
      'permission'
    )
  const integrations = company?.settings?.integrations || {}
  if (!integrations.aitunnelKey)
    return partyError(
      409,
      'ai_not_configured',
      'Подключите ИИ в настройках интеграций компании',
      'validation'
    )
  const settings = {
    ...integrations,
    aiTranscriptionProvider: 'aitunnel',
    timeZone: company?.settings?.timeZone,
  }
  try {
    const bytes = await boundedBody(req)
    const contentType = req.headers.get('content-type') || ''
    const provider = contentType.startsWith('multipart/form-data')
      ? integrations.aiTranscriptionProvider
      : integrations.aiAnalysisProvider
    if (provider && provider !== 'aitunnel')
      return partyError(
        409,
        'ai_provider_unsupported',
        'Для помощника заказов выберите провайдера aitunnel в настройках ИИ компании',
        'validation'
      )
    if (contentType.startsWith('multipart/form-data')) {
      const form = await new Response(bytes, {
        headers: { 'Content-Type': contentType },
      }).formData()
      const file = form.get('audio')
      if (
        !file ||
        typeof file.arrayBuffer !== 'function' ||
        !file.size ||
        !/^(audio\/|video\/webm)/.test(file.type)
      )
        return partyError(
          400,
          'invalid_audio',
          'Выберите аудиозапись',
          'validation'
        )
      const text = await transcribeAudioBlob(
        file,
        file.name || 'recording.webm',
        settings
      )
      return NextResponse.json(
        { success: true, data: { text: text.slice(0, 12000) } },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    let body
    try {
      body = JSON.parse(bytes.toString('utf8'))
    } catch {
      return partyError(
        400,
        'invalid_json',
        'Некорректный запрос',
        'validation'
      )
    }
    if (
      typeof body?.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 12000
    )
      return partyError(
        400,
        'invalid_text',
        'Введите текст до 12 000 символов',
        'validation'
      )
    if (body.orderId) {
      if (!isValidObjectId(body.orderId))
        return partyError(
          400,
          'invalid_order',
          'Некорректный заказ',
          'validation'
        )
      const Orders = await getPartyOrderModel()
      const order = await Orders.findOne({
        _id: body.orderId,
        tenantId: context.tenantId,
      })
        .select('status')
        .lean()
      if (!order)
        return partyError(
          404,
          'order_not_found',
          'Заказ не найден',
          'not_found'
        )
      if (['closed', 'canceled'].includes(order.status))
        return partyError(
          409,
          'order_locked',
          'Закрытый или отменённый заказ нельзя изменить с ИИ',
          'validation'
        )
    }
    const [Clients, Locations, Services] = await Promise.all([
      getPartyClientModel(),
      getPartyLocationModel(),
      getPartyServiceModel(),
    ])
    const filter = { tenantId: context.tenantId, status: { $ne: 'archived' } }
    const [clients, locations, services] = await Promise.all([
      Clients.find(filter)
        .select('_id firstName secondName phone')
        .limit(200)
        .lean(),
      Locations.find(filter).select('_id title').limit(200).lean(),
      Services.find(filter).select('_id title').limit(200).lean(),
    ])
    const draft = Object.fromEntries(
      Object.keys(PARTY_AI_FIELDS)
        .filter((key) => Object.hasOwn(body.draft || {}, key))
        .map((key) => [key, body.draft[key]])
    )
    if (JSON.stringify(draft).length > 16000)
      return partyError(
        400,
        'invalid_draft',
        'Слишком большой контекст заказа',
        'validation'
      )
    const data = await preparePartyOrderAi({
      text: body.text.trim(),
      draft,
      catalogs: { clients, locations, services },
      settings,
    })
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    if (error.message === 'BODY_TOO_LARGE')
      return partyError(
        413,
        'body_too_large',
        'Запись должна быть меньше 10 МБ',
        'validation'
      )
    return partyError(
      502,
      'ai_failed',
      'Не удалось обработать запрос. Текст и заказ сохранены в форме; попробуйте ещё раз.'
    )
  }
}
