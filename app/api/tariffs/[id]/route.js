import { NextResponse } from 'next/server'
import Tariffs from '@models/Tariffs'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const canManageTariffs = (user) => ['admin', 'dev'].includes(user?.role)

export const PUT = async (req, { params }) => {
  const { id } = await params
  const { user } = await getTenantContext()
  if (!user || !canManageTariffs(user)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  const body = await req.json()
  await dbConnect()
  const tariff = await Tariffs.findOneAndUpdate({ _id: id }, body, {
    returnDocument: 'after',
  })
  if (!tariff) {
    return NextResponse.json(
      { success: false, error: 'Тариф не найден' },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true, data: tariff }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const { user } = await getTenantContext()
  if (!user || !canManageTariffs(user)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  await dbConnect()
  const deleted = await Tariffs.findOneAndDelete({ _id: id })
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: 'Тариф не найден' },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true }, { status: 200 })
}
