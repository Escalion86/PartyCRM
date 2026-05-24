import { NextResponse } from 'next/server'

export const GET = async () => {
  const appId = process.env.VK_ID_APP_ID || ''
  const redirectUri = process.env.VK_ID_REDIRECT_URI || ''
  const debug =
    process.env.VK_DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_VK_DEBUG_LOGS === 'true'
  const allowVkAuth =
    process.env.VK_AUTH_ENABLED === 'true' &&
    Boolean(appId) &&
    Boolean(redirectUri) &&
    Boolean(process.env.VK_ID_APP_ID) &&
    Boolean(process.env.VK_ID_CLIENT_SECRET) &&
    Boolean(process.env.VK_ID_REDIRECT_URI)

  return NextResponse.json(
    {
      success: true,
      data: {
        allowVkAuth,
        appId: allowVkAuth ? appId : '',
        redirectUri: allowVkAuth ? redirectUri : '',
        scope: process.env.NEXT_PUBLIC_VK_ID_SCOPE || 'phone email',
        debug,
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
