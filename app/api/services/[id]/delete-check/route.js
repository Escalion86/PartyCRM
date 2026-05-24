import { NextResponse } from 'next/server'
import Services from '@models/Services'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

export const GET = async (req, { params }) => {
  const { id } = await params
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()
  const service = await Services.findOne({ _id: id, tenantId }).lean()
  if (!service) {
    return NextResponse.json(
      { success: false, error: 'Услуга не найдена' },
      { status: 404 }
    )
  }

  const eventsCount = await Events.countDocuments({
    tenantId,
    servicesIds: id,
  })
  const reasons = []
  if (eventsCount > 0) reasons.push({ type: 'events', count: eventsCount })

  return NextResponse.json(
    {
      success: true,
      data: {
        allowed: reasons.length === 0,
        reasons,
      },
    },
    { status: 200 }
  )
}
