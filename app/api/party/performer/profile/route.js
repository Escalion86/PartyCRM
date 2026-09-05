import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyStaffModel,
  getPartyUserModel,
} from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'

const sanitizeText = (value, maxLength = 100) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const serializeStaffProfile = ({ staff, company }) => ({
  _id: String(staff._id),
  companyId: String(staff.tenantId || ''),
  companyTitle: company?.title || 'Компания',
  firstName: staff.firstName || '',
  secondName: staff.secondName || '',
  phone: staff.phone || '',
  email: staff.email || '',
  specialization: staff.specialization || '',
  description: staff.description || '',
  role: staff.role || 'performer',
})

const serializeProfile = ({ user, staffItems, companiesById }) => ({
  user: {
    _id: String(user._id),
    firstName: user.firstName || '',
    secondName: user.secondName || '',
    phone: user.phone || '',
    email: user.email || '',
  },
  staff: staffItems.map((staff) =>
    serializeStaffProfile({
      staff,
      company: companiesById.get(String(staff.tenantId)),
    })
  ),
})

const loadProfileData = async ({ sessionUser, memberships }) => {
  const staffIds = memberships
    .filter((membership) => !membership.isDeveloperAccess)
    .map((membership) => String(membership.staffId))
    .filter(Boolean)

  const PartyStaff = await getPartyStaffModel()
  const PartyCompanies = await getPartyCompanyModel()
  const staffItems = staffIds.length
    ? await PartyStaff.find({
        _id: { $in: staffIds },
        authUserId: String(sessionUser._id),
        status: { $ne: 'archived' },
      })
        .sort({ createdAt: 1 })
        .lean()
    : []
  const tenantIds = [
    ...new Set(staffItems.map((staff) => String(staff.tenantId)).filter(Boolean)),
  ]
  const companies = tenantIds.length
    ? await PartyCompanies.find({
        _id: { $in: tenantIds },
        status: { $ne: 'archived' },
      }).lean()
    : []
  const companiesById = new Map(
    companies.map((company) => [String(company._id), company])
  )

  return { staffItems, companiesById }
}

export async function GET() {
  const { sessionUser, memberships } = await getPartyMembershipContext({ excludeLocationOwners: true })

  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const { staffItems, companiesById } = await loadProfileData({
    sessionUser,
    memberships,
  })

  return NextResponse.json({
    success: true,
    data: serializeProfile({
      user: sessionUser,
      staffItems,
      companiesById,
    }),
  })
}

export async function PATCH(req) {
  const { sessionUser, memberships } = await getPartyMembershipContext({ excludeLocationOwners: true })

  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const userPatch = body.user && typeof body.user === 'object' ? body.user : {}
  const PartyUsers = await getPartyUserModel()

  const userUpdate = {}
  if (Object.prototype.hasOwnProperty.call(userPatch, 'firstName')) {
    userUpdate.firstName = sanitizeText(userPatch.firstName, 100)
  }
  if (Object.prototype.hasOwnProperty.call(userPatch, 'secondName')) {
    userUpdate.secondName = sanitizeText(userPatch.secondName, 100)
  }
  if (Object.prototype.hasOwnProperty.call(userPatch, 'email')) {
    userUpdate.email = sanitizeText(userPatch.email, 160).toLowerCase()
  }

  if (Object.keys(userUpdate).length > 0) {
    await PartyUsers.updateOne(
      { _id: sessionUser._id },
      {
        $set: userUpdate,
      }
    )
  }

  const updatedUser = await PartyUsers.findById(sessionUser._id).lean()
  const { staffItems, companiesById } = await loadProfileData({
    sessionUser: updatedUser,
    memberships,
  })

  return NextResponse.json({
    success: true,
    data: serializeProfile({
      user: updatedUser,
      staffItems,
      companiesById,
    }),
  })
}
