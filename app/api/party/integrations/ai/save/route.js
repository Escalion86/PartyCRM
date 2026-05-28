import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { normalizeAiSettings } from '@server/aiSettings'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const {
    aitunnelKey,
    aiAnalysisProvider,
    aiAnalysisModel,
    aiTranscriptionProvider,
    aiTranscriptionModel,
  } = body

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}

  const nextIntegrations = {
    ...integrations,
    aitunnelKey: aitunnelKey || '',
    aiAnalysisProvider: aiAnalysisProvider || '',
    aiAnalysisModel: aiAnalysisModel || '',
    aiTranscriptionProvider: aiTranscriptionProvider || '',
    aiTranscriptionModel: aiTranscriptionModel || '',
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations': nextIntegrations },
    }
  )

  return NextResponse.json({
    success: true,
    data: normalizeAiSettings(nextIntegrations),
  })
}
