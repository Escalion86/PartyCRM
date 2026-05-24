import { NextResponse } from 'next/server'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

/**
 * GET /api/push/contacts
 * Get contact push notification preferences for current user
 */
export const GET = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const user = await Users.findOne({ tenantId })
    .select('notifications')
    .lean()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const notifications = user.notifications || new Map()
  const contactPush = notifications.get('contactPush') || {
    created: true,
    updated: true,
  }

  return NextResponse.json({ success: true, data: contactPush }, { status: 200 })
}

/**
 * PUT /api/push/contacts
 * Update contact push notification preferences
 */
export const PUT = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const { created, updated } = body
  if (created === undefined && updated === undefined) {
    return NextResponse.json(
      { success: false, error: 'Укажите хотя бы одно поле: created или updated' },
      { status: 400 }
    )
  }

  await dbConnect()

  const user = await Users.findOne({ tenantId }).select('notifications')
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const currentContactPush = user.notifications?.get('contactPush') || {
    created: true,
    updated: true,
  }

  const updatedContactPush = {
    created: created !== undefined ? Boolean(created) : currentContactPush.created,
    updated: updated !== undefined ? Boolean(updated) : currentContactPush.updated,
  }

  await Users.updateOne(
    { tenantId },
    { $set: { 'notifications.contactPush': updatedContactPush } }
  )

  return NextResponse.json({ success: true, data: updatedContactPush }, { status: 200 })
}
