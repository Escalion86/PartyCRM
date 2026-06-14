import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import { createCore, jsonResult, nonceCookieOptions } from '../_shared'
export async function GET(req) { const { context, error } = await getPartyRequestContext({ req, managementOnly: true }); if (error) return error; const result = await createCore().authUrl({ companyId: context.tenantId, userId: String(context.sessionUser?._id || context.user?._id || '') }); if (result.error) return jsonResult(result); const response = NextResponse.json({ success: true, data: result.data }); response.cookies.set(result.cookieName, result.nonce, nonceCookieOptions); return response }
