import { NextResponse } from 'next/server'
import { getPartyRequestContext } from '@server/partyApi'
import {
  serializePartyMembershipCompany,
  serializePartyMembershipStaff,
} from '@server/partyMembershipResponse'

export async function GET(req) {
  try {
    const { context, error } = await getPartyRequestContext({
      req,
      allowLocationOwner: true,
    })
    if (error) {
      return error
    }

    const { staff, company, tenantId, role } = context

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        role,
        staff: serializePartyMembershipStaff(staff),
        company: serializePartyMembershipCompany(company, role),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'partycrm_context_failed',
          type: 'server',
          message: 'Не удалось загрузить данные компании',
        },
      },
      { status: 500 }
    )
  }
}
