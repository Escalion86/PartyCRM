import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import {
  getPartySessionUser,
  normalizePartyInterfaceRoles,
} from '@server/partyAuth'
import { normalizePartyWorkspace } from '@server/partyEntry'

const sanitizeText = (value, maxLength = 100) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const serializePartyUser = (user) => ({
  _id: String(user._id),
  role: user.role || 'user',
  phone: user.phone || '',
  email: user.email || '',
  firstName: user.firstName || '',
  secondName: user.secondName || '',
  interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
  lastWorkspace: normalizePartyWorkspace(user.lastWorkspace),
  performerOnboardingCompletedAt: user.performerOnboardingCompletedAt || null,
})

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
      user: serializePartyUser(user),
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
  const lastWorkspace = normalizePartyWorkspace(body.lastWorkspace)
  const update = {}

  if (Object.prototype.hasOwnProperty.call(body, 'interfaceRoles')) {
    update.interfaceRoles = normalizePartyInterfaceRoles(body.interfaceRoles)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'firstName')) {
    update.firstName = sanitizeText(body.firstName, 100)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'secondName')) {
    update.secondName = sanitizeText(body.secondName, 100)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'lastWorkspace')) {
    update.lastWorkspace = lastWorkspace
  }
  if (body.performerOnboardingCompleted === true) {
    update.performerOnboardingCompletedAt = new Date()
  }
  if (body.performerOnboardingCompleted === false) {
    update.performerOnboardingCompletedAt = null
  }

  const PartyUsers = await getPartyUserModel()
  const updatedUser = await PartyUsers.findByIdAndUpdate(
    user._id,
    { $set: update },
    { new: true }
  ).lean()

  return NextResponse.json({
    success: true,
    data: {
      user: serializePartyUser(updatedUser),
    },
  })
}
