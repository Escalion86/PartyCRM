import { NextResponse } from 'next/server'
import { normalizeAiSettings } from '@server/aiSettings'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { analyzeCallTranscript } from '@server/callAiAnalysis'
import { normalizeNovofonWebhook } from '@server/novofon'
import {
  getPartyCallModel,
  getPartyClientModel,
  getPartyCompanyModel,
} from '@server/partyModels'
import { savePartyNovofonCall } from '@server/partyNovofonCalls'
import { registerPartyInboxIncoming } from '@server/partyInboxLifecycle'

const getToken = async (params) => String((await params)?.token || '').trim()

const jsonError = (error, status = 400) =>
  NextResponse.json({ success: false, error }, { status })

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
  if (!text.trim()) return {}

  try {
    return JSON.parse(text)
  } catch (error) {
    return Object.fromEntries(new URLSearchParams(text).entries())
  }
}

const getSearchParamsPayload = (req) => {
  const { searchParams } = new URL(req.url)
  return Object.fromEntries(searchParams.entries())
}

const handlePartyNovofonWebhook = async (req, { params }) => {
  const token = await getToken(params)
  if (!token) return jsonError('invalid_novofon_webhook_token', 404)

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findOne({
    'settings.integrations.novofonWebhookSecret': token,
    'settings.integrations.novofonEnabled': true,
    status: { $ne: 'archived' },
  }).lean()

  if (!company) return jsonError('invalid_novofon_webhook_token', 404)

  const { access } = await getPartyCompanyTariffAccessState(company)
  if (!access.allowTelephony) {
    return jsonError('party_novofon_tariff_required', 403)
  }

  const body = {
    ...getSearchParamsPayload(req),
    ...(await parseWebhookBody(req)),
  }
  const normalized = normalizeNovofonWebhook(body)
  const integrations = company?.settings?.integrations ?? {}
  const aiSettings = normalizeAiSettings(integrations)
  const canAnalyze = access.allowAi && Boolean(normalized.transcript)

  const PartyCalls = await getPartyCallModel()
  const PartyClients = await getPartyClientModel()
  const result = await savePartyNovofonCall({
    models: {
      Call: PartyCalls,
      Client: PartyClients,
    },
    tenantId: company._id,
    normalized,
    rawPayload: body,
    analyzeTranscript: canAnalyze
      ? (transcript) => analyzeCallTranscript(transcript, aiSettings)
      : null,
    registerInboxIncoming: registerPartyInboxIncoming,
  })

  return NextResponse.json({ success: true, data: result.call }, { status: 200 })
}

export const GET = handlePartyNovofonWebhook
export const POST = handlePartyNovofonWebhook
