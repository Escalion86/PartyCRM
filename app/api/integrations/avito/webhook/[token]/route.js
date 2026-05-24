import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import SiteSettings from '@models/SiteSettings'
import {
  createOrUpdateAvitoLead,
  normalizeAvitoSettings,
  updateAvitoCustom,
} from '@server/avito'

const parseWebhookBody = async (req) => {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return req.json().catch(() => ({}))
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.formData().catch(() => null)
    if (!formData) return {}
    return Object.fromEntries(formData.entries())
  }
  const text = await req.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    return { text }
  }
}

export const POST = async (req, { params }) => {
  const routeParams = await params
  const token = String(routeParams?.token || '').trim()
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'missing_token', type: 'avito', message: 'Token required' },
      },
      { status: 400 }
    )
  }

  const body = await parseWebhookBody(req)
  await dbConnect()

  const siteSettings = await SiteSettings.findOne({
    'custom.avitoWebhookToken': token,
  })
  if (!siteSettings?.tenantId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'forbidden', type: 'avito', message: 'Forbidden' },
      },
      { status: 403 }
    )
  }

  const avito = normalizeAvitoSettings(siteSettings.custom)
  if (!avito.enabled) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'disabled',
          type: 'avito',
          message: 'Avito integration is disabled',
        },
      },
      { status: 403 }
    )
  }

  const result = await createOrUpdateAvitoLead({
    tenantId: siteSettings.tenantId,
    siteSettings,
    body,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: result.error || 'invalid_payload',
          type: 'avito',
          message: 'Invalid Avito payload',
        },
      },
      { status: result.status || 400 }
    )
  }

  await updateAvitoCustom({
    tenantId: siteSettings.tenantId,
    patch: {
      avitoLastWebhookAt: new Date().toISOString(),
      avitoLastChatId: result.normalized?.avitoChatId || '',
      avitoLastError: '',
    },
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        eventId: String(result.event?._id || ''),
        created: result.created,
        avitoChatId: result.normalized?.avitoChatId || '',
      },
    },
    { status: result.created ? 201 : 200 }
  )
}
