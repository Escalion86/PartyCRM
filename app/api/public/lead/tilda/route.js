import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import {
  createPublicLeadDraftEvent,
  getPublicLeadApiKey,
  normalizePhone,
  normalizeText,
  parseDateValue,
  readCustomValue,
  resolvePublicLeadTenant,
  upsertPublicLeadClient,
} from '@server/publicLeadService'
import {
  getPublicLeadPushState,
  logPublicLeadPushDiagnostic,
  logPublicLeadPushError,
  logPublicLeadPushSkipped,
  notifyApiLeadCreated,
} from '@server/publicLeadPush'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key, X-Public-Api-Key',
}

const toObject = (value) => {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

const parseRawPayload = async (req) => {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return toObject(await req.json().catch(() => ({})))
  }

  const text = await req.text().catch(() => '')
  if (!text) return {}

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(text)
    const payload = {}
    params.forEach((value, key) => {
      payload[key] = value
    })
    return payload
  }

  try {
    return toObject(JSON.parse(text))
  } catch (error) {
    return {}
  }
}

const pickFirst = (payload, keys) => {
  const lowerMap = new Map(
    Object.entries(payload).map(([key, value]) => [key.toLowerCase(), value])
  )
  for (const key of keys) {
    const value = lowerMap.get(String(key).toLowerCase())
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

const normalizeServices = (payload) => {
  const direct = pickFirst(payload, ['servicesIds', 'services_ids'])
  if (Array.isArray(direct)) return direct.map((item) => normalizeText(item, 64))
  if (typeof direct === 'string' && direct.trim()) {
    return direct
      .split(',')
      .map((item) => normalizeText(item, 64))
      .filter(Boolean)
      .slice(0, 20)
  }
  return []
}

const normalizeTildaPayload = (payload) => {
  const name = normalizeText(
    pickFirst(payload, [
      'name',
      'clientName',
      'client_name',
      'fio',
      'fullname',
      'Имя',
      'ФИО',
    ]),
    120
  )
  const phone = normalizePhone(
    pickFirst(payload, ['phone', 'clientPhone', 'client_phone', 'tel', 'Телефон'])
  )
  const whatsapp = normalizePhone(
    pickFirst(payload, ['whatsapp', 'wa', 'WhatsApp'])
  )
  const telegram = normalizeText(
    pickFirst(payload, ['telegram', 'tg', 'Telegram']),
    120
  )
  const comment = normalizeText(
    pickFirst(payload, ['comment', 'description', 'message', 'text', 'Комментарий']),
    5000
  )
  const eventDate = parseDateValue(
    pickFirst(payload, ['eventDate', 'event_date', 'date', 'Дата'])
  )
  const dateEnd = parseDateValue(
    pickFirst(payload, ['dateEnd', 'date_end', 'end_date'])
  )
  const contractSum =
    Number(pickFirst(payload, ['contractSum', 'sum', 'amount', 'budget'])) || 0
  const town = normalizeText(
    pickFirst(payload, ['town', 'city', 'gorod', 'Город']),
    120
  )
  const address = normalizeText(
    pickFirst(payload, ['address', 'location', 'Адрес']),
    500
  )
  const source = normalizeText(pickFirst(payload, ['source']), 120) || 'tilda'
  const servicesIds = normalizeServices(payload)

  return {
    name,
    phone,
    whatsapp,
    telegram,
    comment,
    eventDate,
    dateEnd,
    contractSum,
    town,
    address,
    source,
    servicesIds,
  }
}

export const OPTIONS = async () =>
  new NextResponse(null, { status: 204, headers: CORS_HEADERS })

export const POST = async (req) => {
  try {
    const body = await parseRawPayload(req)
    const apiKey = getPublicLeadApiKey(req, body, true)

    await dbConnect()
    const accessData = await resolvePublicLeadTenant(apiKey)
    if (!accessData.ok) {
      return NextResponse.json(
        { success: false, error: accessData.error },
        { status: accessData.status, headers: CORS_HEADERS }
      )
    }
    const tenantId = accessData.tenantId
    const rawPublicLeadPushEnabled = readCustomValue(
      accessData?.siteSettings?.custom,
      'publicLeadPushEnabled'
    )
    const configuredPushEnabled = rawPublicLeadPushEnabled === true

    const normalized = normalizeTildaPayload(body)

    if (
      !normalized.name &&
      !normalized.phone &&
      !normalized.telegram &&
      !normalized.whatsapp
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Нужен минимум один контакт: имя, телефон, telegram или whatsapp',
        },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (
      normalized.eventDate &&
      normalized.dateEnd &&
      normalized.eventDate.getTime() > normalized.dateEnd.getTime()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Дата начала не может быть позже даты завершения',
        },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const client = await upsertPublicLeadClient({
      tenantId,
      name: normalized.name,
      phone: normalized.phone,
      whatsapp: normalized.whatsapp,
      telegram: normalized.telegram,
    })

    const event = await createPublicLeadDraftEvent({
      tenantId,
      clientId: client?._id ?? null,
      normalizedData: normalized,
      rawPayload: body,
      historyUserId: 'public-api-tilda',
      apiKeyData: accessData.apiKeyData,
    })

    const pushState = await getPublicLeadPushState({
      tenantId,
      configured: configuredPushEnabled,
    })
    await logPublicLeadPushDiagnostic({
      tenantId,
      event,
      stage: 'resolved',
      message: 'Диагностика push по Tilda API-заявке: состояние перед отправкой',
      meta: {
        configured: pushState.configured,
        rawConfigured: rawPublicLeadPushEnabled,
        activeSubscriptions: pushState.activeSubscriptions,
        enabled: pushState.enabled,
        skippedReason: pushState.skippedReason,
        fallbackUsed: pushState.fallbackUsed,
        apiKeyName: accessData?.apiKeyData?.name || '',
        endpoint: 'public_lead_tilda',
      },
    })
    let pushStatus = {
      enabled: pushState.enabled,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: pushState.enabled ? '' : pushState.skippedReason,
    }

    if (pushState.enabled) {
      try {
        const pushResult = await notifyApiLeadCreated({
          tenantId,
          event,
          normalizedData: {
            phone: normalized.phone,
            source: accessData?.apiKeyData?.name || normalized.source,
          },
        })
        pushStatus = {
          enabled: true,
          sent: Number(pushResult?.sent || 0),
          failed: Number(pushResult?.failed || 0),
          deactivated: Number(pushResult?.deactivated || 0),
          skippedReason:
            Number(pushResult?.sent || 0) <= 0 &&
            Number(pushResult?.failed || 0) <= 0
              ? 'no_active_subscriptions'
              : '',
          reason: pushResult?.reason || '',
        }

        if (
          pushResult &&
          Number(pushResult?.sent || 0) <= 0 &&
          Number(pushResult?.failed || 0) > 0
        ) {
          console.warn('public tilda lead push delivery failed', {
            tenantId: String(tenantId),
            eventId: String(event?._id || ''),
            failed: Number(pushResult?.failed || 0),
            deactivated: Number(pushResult?.deactivated || 0),
          })
        }
        await logPublicLeadPushDiagnostic({
          tenantId,
          event,
          stage: 'result',
          status: Number(pushStatus.failed || 0) > 0 ? 'partial' : 'ok',
          message: 'Диагностика push по Tilda API-заявке: результат отправки',
          meta: {
            sent: pushStatus.sent,
            failed: pushStatus.failed,
            deactivated: pushStatus.deactivated,
            skippedReason: pushStatus.skippedReason,
            reason: pushStatus.reason || '',
            endpoint: 'public_lead_tilda',
          },
        })
      } catch (error) {
        console.error('public tilda lead push notify error', error)
        await logPublicLeadPushError({ tenantId, event, error })
        pushStatus = {
          enabled: true,
          sent: 0,
          failed: 1,
          deactivated: 0,
          skippedReason: 'notify_error',
        }
      }
    } else {
      await logPublicLeadPushSkipped({
        tenantId,
        event,
        reason: pushState.skippedReason,
        configured: configuredPushEnabled,
        activeSubscriptions: pushState.activeSubscriptions,
        fallbackUsed: pushState.fallbackUsed,
      })
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          eventId: String(event._id),
          clientId: client?._id ? String(client._id) : null,
          status: event.status,
          push: pushStatus,
        },
      },
      { status: 201, headers: CORS_HEADERS }
    )
  } catch (error) {
    console.error('public tilda lead create error', error)
    return NextResponse.json(
      { success: false, error: 'Внутренняя ошибка сервера' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
