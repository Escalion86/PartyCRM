import { NextResponse } from 'next/server'
import Services from '@models/Services'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const service = await Services.findOneAndUpdate(
    { _id: id, tenantId },
    body,
    {
      returnDocument: 'after',
    }
  )
  if (!service)
    return NextResponse.json(
      { success: false, error: 'Услуга не найдена' },
      { status: 404 }
    )
  return NextResponse.json({ success: true, data: service }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const eventsCount = await Events.countDocuments({
    tenantId,
    servicesIds: id,
  })
  if (eventsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить услугу: есть мероприятия (${eventsCount})`,
      },
      { status: 409 }
    )
  }
  const deleted = await Services.findOneAndDelete({ _id: id, tenantId })
  if (!deleted)
    return NextResponse.json(
      { success: false, error: 'Услуга не найдена' },
      { status: 404 }
    )
  return NextResponse.json({ success: true }, { status: 200 })
}
