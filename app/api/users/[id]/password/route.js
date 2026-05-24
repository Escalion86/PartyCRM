import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { user } = await getTenantContext()

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const newPassword = String(body?.newPassword ?? '')
  if (newPassword.length < 8) {
    return NextResponse.json(
      { success: false, error: 'Пароль должен быть не менее 8 символов' },
      { status: 400 }
    )
  }

  await dbConnect()

  const targetUser = await Users.findById(id)
  if (!targetUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  targetUser.password = await bcrypt.hash(newPassword, 10)
  await targetUser.save()

  return NextResponse.json({ success: true }, { status: 200 })
}
