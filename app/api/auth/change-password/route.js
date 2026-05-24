import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isHash = (value) => typeof value === 'string' && value.startsWith('$2')

export const POST = async (req) => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const currentPassword = body.currentPassword ?? ''
  const newPassword = body.newPassword ?? ''

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, error: 'Заполните текущий и новый пароль' },
      { status: 400 }
    )
  }
  if (String(newPassword).length < 8) {
    return NextResponse.json(
      { success: false, error: 'Пароль должен быть не менее 8 символов' },
      { status: 400 }
    )
  }

  await dbConnect()
  const dbUser = await Users.findById(user._id)
  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const storedPassword = dbUser.password ?? ''
  const passwordMatch = isHash(storedPassword)
    ? await bcrypt.compare(currentPassword, storedPassword)
    : storedPassword === currentPassword

  if (!passwordMatch) {
    return NextResponse.json(
      { success: false, error: 'Текущий пароль неверен' },
      { status: 400 }
    )
  }

  dbUser.password = await bcrypt.hash(newPassword, 10)
  await dbUser.save()

  return NextResponse.json({ success: true }, { status: 200 })
}
