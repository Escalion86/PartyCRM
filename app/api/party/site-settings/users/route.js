import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import { getPartySiteSettingsDevUser } from '@server/partySiteSettingsAccess'

export const GET = async () => {
  const { error } = await getPartySiteSettingsDevUser()
  if (error) return error

  const PartyUsers = await getPartyUserModel()
  const users = await PartyUsers.find({})
    .select('-password')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean()

  return NextResponse.json({ success: true, data: users }, { status: 200 })
}

export const dynamic = 'force-dynamic'
