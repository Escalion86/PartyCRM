import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { serializePartyMembershipResponse } from '@server/partyMembershipResponse'

export async function GET() {
  try {
    const { sessionUser, memberships } = await getPartyMembershipContext()

    if (!sessionUser?._id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'unauthorized',
            type: 'auth',
            message: 'Не авторизован',
          },
        },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        memberships: memberships.map(serializePartyMembershipResponse),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'partycrm_memberships_failed',
          type: 'server',
          message: 'Не удалось загрузить доступные компании',
        },
      },
      { status: 500 }
    )
  }
}
