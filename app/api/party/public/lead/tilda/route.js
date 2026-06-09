import { NextResponse } from 'next/server'
import {
  getPartyPublicLeadApiKey,
  normalizePartyTildaLeadPayload,
} from '@server/partyPublicLeadCore'
import {
  createPartyPublicLeadOrder,
  resolvePartyPublicLeadCompany,
} from '@server/partyPublicLeadService'

const parseBody = async (req) => {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      const body = await req.json()
      return body && typeof body === 'object' ? body : {}
    } catch {
      return {}
    }
  }

  const form = await req.formData().catch(() => null)
  if (!form) return {}
  return Object.fromEntries(form.entries())
}

export async function POST(req) {
  const body = await parseBody(req)
  const apiKey = getPartyPublicLeadApiKey(req, body)
  const resolved = await resolvePartyPublicLeadCompany(apiKey)

  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status }
    )
  }

  const normalized = normalizePartyTildaLeadPayload(body)
  if (!normalized.clientName && !normalized.phone && !normalized.email) {
    return NextResponse.json(
      { success: false, error: 'Укажите имя, телефон или email клиента' },
      { status: 400 }
    )
  }

  const { client, order } = await createPartyPublicLeadOrder({
    company: resolved.company,
    normalized,
    rawPayload: body,
    apiKeyData: resolved.apiKeyData,
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        clientId: String(client._id),
        orderId: String(order._id),
        status: order.status,
      },
    },
    { status: 201 }
  )
}
