import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import {
  createPublicLeadDraftEvent,
  getPublicLeadApiKey,
  normalizePhone,
  normalizeServicesIds,
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

export const OPTIONS = async () =>
  new NextResponse(null, { status: 204, headers: CORS_HEADERS })

export const POST = async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const apiKey = getPublicLeadApiKey(req, body)

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

    const name = normalizeText(body?.name || body?.clientName, 120)
    const phone = normalizePhone(body?.phone || body?.clientPhone)
    const whatsapp = normalizePhone(body?.whatsapp)
    const telegram = normalizeText(body?.telegram, 120)
    const comment = normalizeText(
      body?.comment || body?.description || body?.message,
      5000
    )
    const eventDate = parseDateValue(body?.eventDate)
    const dateEnd = parseDateValue(body?.dateEnd)
    const contractSum = Number(body?.contractSum) || 0
    const servicesIds = normalizeServicesIds(body?.servicesIds)
    const source = normalizeText(body?.source, 120) || 'public_api'
    const town = normalizeText(body?.town || body?.city, 120)
    const address = normalizeText(body?.address || body?.location, 500)

    if (!name && !phone && !telegram && !whatsapp) {
      return NextResponse.json(
        {
          success: false,
          error: 'Нужен минимум один контакт: имя, телефон, telegram или whatsapp',
        },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    if (eventDate && dateEnd && eventDate.getTime() > dateEnd.getTime()) {
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
      name,
      phone,
      whatsapp,
      telegram,
    })

    const event = await createPublicLeadDraftEvent({
      tenantId,
      clientId: client?._id ?? null,
      normalizedData: {
        name,
        phone,
        telegram,
        whatsapp,
        comment,
        eventDate,
        dateEnd,
        town,
        address,
        servicesIds,
        contractSum,
        source,
      },
      rawPayload: body,
      historyUserId: 'public-api',
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
      message: 'Диагностика push по API-заявке: состояние перед отправкой',
      meta: {
        configured: pushState.configured,
        rawConfigured: rawPublicLeadPushEnabled,
        activeSubscriptions: pushState.activeSubscriptions,
        enabled: pushState.enabled,
        skippedReason: pushState.skippedReason,
        fallbackUsed: pushState.fallbackUsed,
        apiKeyName: accessData?.apiKeyData?.name || '',
        endpoint: 'public_lead',
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
            phone,
            source: accessData?.apiKeyData?.name || source,
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
          console.warn('public lead push delivery failed', {
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
          message: 'Диагностика push по API-заявке: результат отправки',
          meta: {
            sent: pushStatus.sent,
            failed: pushStatus.failed,
            deactivated: pushStatus.deactivated,
            skippedReason: pushStatus.skippedReason,
            reason: pushStatus.reason || '',
            endpoint: 'public_lead',
          },
        })
      } catch (error) {
        console.error('public lead push notify error', error)
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
    console.error('public lead create error', error)
    return NextResponse.json(
      { success: false, error: 'Внутренняя ошибка сервера' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
