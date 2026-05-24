import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'

export async function GET(req) {
  try {
    const { context, error } = await getPartyRequestContext({ req })
    if (error) {
      return error
    }

    const { staff, company, tenantId, role } = context

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        role,
        staff,
        company,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'partycrm_context_failed',
          type: 'server',
          message: error.message,
        },
      },
      { status: 500 }
    )
  }
}
