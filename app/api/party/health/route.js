import { NextResponse } from 'next/server'
import { PRODUCTS } from '@server/productContext'
import { getProductDbConnection } from '@server/productDbConnect'
import {
  buildPartyHealthPayload,
  canReadPartyHealthDetails,
} from '@server/partyHealthCore'
import {
  getPartyAssignmentModel,
  getPartyCompanyModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyStaffModel,
} from '@server/partyModels'

export async function GET(req) {
  const startedAt = performance.now()
  const includeDetails = canReadPartyHealthDetails({
    requestToken: req.headers.get('x-health-secret'),
    secret: process.env.PARTYCRM_HEALTH_SECRET,
  })

  try {
    const connection = await getProductDbConnection(PRODUCTS.PARTYCRM)
    await connection.db.admin().ping()

    if (!includeDetails) {
      return NextResponse.json(
        buildPartyHealthPayload({
          product: PRODUCTS.PARTYCRM,
          databaseStatus: 'ready',
          latencyMs: performance.now() - startedAt,
        })
      )
    }

    const [Companies, Staff, Locations, Assignments, Orders] = await Promise.all([
      getPartyCompanyModel(),
      getPartyStaffModel(),
      getPartyLocationModel(),
      getPartyAssignmentModel(),
      getPartyOrderModel(),
    ])
    const [
      companiesCount,
      staffCount,
      locationsCount,
      assignmentsCount,
      ordersCount,
    ] =
      await Promise.all([
        Companies.estimatedDocumentCount(),
        Staff.estimatedDocumentCount(),
        Locations.estimatedDocumentCount(),
        Assignments.estimatedDocumentCount(),
        Orders.estimatedDocumentCount(),
      ])

    return NextResponse.json(
      buildPartyHealthPayload({
        product: PRODUCTS.PARTYCRM,
        databaseStatus: 'ready',
        latencyMs: performance.now() - startedAt,
        details: {
          readyState: connection.readyState,
          collections: {
            companies: companiesCount,
            staff: staffCount,
            locations: locationsCount,
            assignments: assignmentsCount,
            orders: ordersCount,
          },
        },
      })
    )
  } catch (error) {
    console.error('[party/health] database unavailable', {
      name: error?.name || 'Error',
      code: error?.code || 'partycrm_db_unavailable',
    })
    return NextResponse.json(
      {
        ...buildPartyHealthPayload({
          product: PRODUCTS.PARTYCRM,
          databaseStatus: 'unavailable',
          latencyMs: performance.now() - startedAt,
        }),
        error: {
          code: 'partycrm_db_unavailable',
          type: 'service',
          message: 'PartyCRM database is unavailable',
        },
      },
      { status: 503 }
    )
  }
}

export const dynamic = 'force-dynamic'
