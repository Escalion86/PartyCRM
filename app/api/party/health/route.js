import { NextResponse } from 'next/server'
import { PRODUCTS } from '@server/productContext'
import { getProductDbConnection } from '@server/productDbConnect'
import {
  getPartyAssignmentModel,
  getPartyCompanyModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyStaffModel,
} from '@server/partyModels'

export async function GET() {
  try {
    const connection = await getProductDbConnection(PRODUCTS.PARTYCRM)
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

    return NextResponse.json({
      success: true,
      product: PRODUCTS.PARTYCRM,
      dbName: connection.name,
      readyState: connection.readyState,
      collections: {
        companies: companiesCount,
        staff: staffCount,
        locations: locationsCount,
        assignments: assignmentsCount,
        orders: ordersCount,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        product: PRODUCTS.PARTYCRM,
        error: {
          code: 'partycrm_db_unavailable',
          type: 'configuration',
          message: error.message,
        },
      },
      { status: 503 }
    )
  }
}
