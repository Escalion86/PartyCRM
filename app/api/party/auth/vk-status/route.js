import { NextResponse } from 'next/server'
import { getPartyVkIdConfig } from '@server/partyVkIdAuth.mjs'

export const GET = async () => {
  const config = getPartyVkIdConfig()

  return NextResponse.json(
    {
      success: true,
      data: {
        enabled: config.enabled,
        appId: config.enabled ? config.appId : '',
        redirectUri: config.enabled ? config.redirectUri : '',
        scope: config.enabled ? config.scope : '',
      },
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
