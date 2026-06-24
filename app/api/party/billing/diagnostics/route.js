import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { buildPartyBillingDiagnostics } from '@server/partyBillingDiagnostics'

export const GET = async (req) => {
  const { error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  return NextResponse.json({
    success: true,
    data: buildPartyBillingDiagnostics(),
  })
}

export const dynamic = 'force-dynamic'
