import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ settings: 1 })
    .lean()

  const integrations = company?.settings?.integrations ?? {}

  const AVITO_KEYS = [
    'avitoEnabled',
    'avitoClientId',
    'avitoClientSecret',
    'avitoUserId',
    'avitoWebhookToken',
    'avitoWebhookUrl',
    'avitoWebhookId',
    'avitoStatus',
    'avitoLastError',
    'avitoConnectedAt',
    'avitoLastCheckedAt',
    'avitoLastWebhookAt',
    'avitoLastChatId',
  ]

  const cleaned = { ...integrations }
  for (const key of AVITO_KEYS) {
    delete cleaned[key]
  }

  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    {
      $set: { 'settings.integrations': cleaned },
    }
  )

  return NextResponse.json({ success: true, data: { status: 'disconnected' } })
}
