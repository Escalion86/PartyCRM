import { NextResponse } from 'next/server'
import Services from '@models/Services'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

export const GET = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const services = await Services.find({ tenantId })
    .sort({ index: 1, title: 1 })
    .lean()
  return NextResponse.json({ success: true, data: services }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json()
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const service = await Services.create({ ...body, tenantId })
  return NextResponse.json({ success: true, data: service }, { status: 201 })
}
