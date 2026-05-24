import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import {
  getPartySessionUser,
  normalizePartyInterfaceRoles,
} from '@server/partyAuth'

export async function GET() {
  const user = await getPartySessionUser()

  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      user: {
        _id: String(user._id),
        phone: user.phone || '',
        email: user.email || '',
        firstName: user.firstName || '',
        secondName: user.secondName || '',
        interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
      },
    },
  })
}

export async function PATCH(req) {
  const user = await getPartySessionUser()

  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const interfaceRoles = normalizePartyInterfaceRoles(body.interfaceRoles)
  const PartyUsers = await getPartyUserModel()
  const updatedUser = await PartyUsers.findByIdAndUpdate(
    user._id,
    { $set: { interfaceRoles } },
    { new: true }
  ).lean()

  return NextResponse.json({
    success: true,
    data: {
      user: {
        _id: String(updatedUser._id),
        phone: updatedUser.phone || '',
        email: updatedUser.email || '',
        firstName: updatedUser.firstName || '',
        secondName: updatedUser.secondName || '',
        interfaceRoles: normalizePartyInterfaceRoles(updatedUser.interfaceRoles),
      },
    },
  })
}
