import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { uploadPartyCompanyLogo } from '@server/partyCompanyLogoUpload'

export const runtime = 'nodejs'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const data = await uploadPartyCompanyLogo({ req, tenantId: context.tenantId })
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) {
    return partyError(
      cause.status || 500,
      cause.code || 'partycrm_logo_upload_failed',
      cause.status ? cause.message : 'Не удалось загрузить логотип. Попробуйте ещё раз.',
      cause.status && cause.status < 500 ? 'validation' : 'server'
    )
  }
}
