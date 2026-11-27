import { NextResponse } from 'next/server'
import { normalizePartyPhone } from '@server/partyAuth'
import { getPartyUserModel } from '@server/partyModels'
import { getPartySiteSettingsDevUser } from '@server/partySiteSettingsAccess'

const MAX_PAGE_SIZE = 500
const SEARCH_FIELDS = ['firstName', 'secondName', 'phone', 'email']

const positiveInteger = (value, fallback) => {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

const buildSearchFilter = (query) => {
  if (!query) return {}

  const normalizedPhone = /^[+\d\s().-]+$/.test(query)
    ? normalizePartyPhone(query)
    : ''
  const terms = normalizedPhone ? [normalizedPhone] : query.split(/\s+/)

  return {
    $and: terms.map((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = { $regex: escaped, $options: 'i' }
      return { $or: SEARCH_FIELDS.map((field) => ({ [field]: regex })) }
    }),
  }
}

export const GET = async (request) => {
  const { user, error } = await getPartySiteSettingsDevUser()
  if (error) return error

  const { searchParams } = request.nextUrl
  const pageSize = Math.min(
    positiveInteger(searchParams.get('pageSize'), MAX_PAGE_SIZE),
    MAX_PAGE_SIZE
  )
  const page = Math.min(
    positiveInteger(searchParams.get('page'), 1),
    Math.floor(Number.MAX_SAFE_INTEGER / pageSize)
  )
  const query = searchParams.get('q')?.trim().slice(0, 200).trim() || ''
  const filter = buildSearchFilter(query)

  const PartyUsers = await getPartyUserModel()
  const [users, total, active] = await Promise.all([
    PartyUsers.find(filter)
      .select('firstName secondName phone email role interfaceRoles status createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PartyUsers.countDocuments(filter),
    PartyUsers.countDocuments({ ...filter, status: 'active' }),
  ])

  return NextResponse.json({
    success: true,
    data: users,
    viewerId: String(user._id),
    pagination: { page, pageSize, total, active },
  })
}

export const dynamic = 'force-dynamic'
