import { NextResponse } from 'next/server'
import { getPartySessionUser } from '@server/partyAuth'
import {
  PARTY_STAFF_ROLES,
  getPartyCompanyModel,
  getPartyLocationModel,
  getPartyStaffModel,
} from '@server/partyModels'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const normalizeEmail = (email) => {
  if (!email) return ''
  return String(email).trim().toLowerCase()
}

const normalizeText = (value, maxLength = 160) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const normalizeInitialLocation = (value) => {
  if (!value || typeof value !== 'object') return null
  const title = normalizeText(value.title)
  const address = {
    town: normalizeText(value.address?.town, 120),
    street: normalizeText(value.address?.street, 180),
    house: normalizeText(value.address?.house, 40),
    room: normalizeText(value.address?.room, 80),
  }
  if (!title && !Object.values(address).some(Boolean)) return null

  return {
    title: title || 'Первая точка',
    address,
  }
}

const normalizeInitialStaff = (value) => {
  if (!value || typeof value !== 'object') return null
  const firstName = normalizeText(value.firstName, 100)
  const secondName = normalizeText(value.secondName, 100)
  const staffPhone = normalizePhone(value.phone)
  const staffEmail = normalizeEmail(value.email)
  const role = value.role === 'admin' ? 'admin' : 'performer'

  if (!firstName && !secondName && !staffPhone && !staffEmail) return null

  return {
    firstName,
    secondName,
    phone: staffPhone,
    email: staffEmail,
    role,
    status: 'active',
  }
}

export async function POST(req) {
  const sessionUser = await getPartySessionUser()

  if (!sessionUser?._id) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'unauthorized',
          type: 'auth',
          message: 'Не авторизован',
        },
      },
      { status: 401 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const PartyCompanies = await getPartyCompanyModel()
    const PartyStaff = await getPartyStaffModel()
    const PartyLocations = await getPartyLocationModel()

    const authUserId = String(sessionUser._id)
    const phone = normalizePhone(sessionUser.phone)
    const email = normalizeEmail(sessionUser.email)

    const existingStaff = await PartyStaff.findOne({
      status: { $ne: 'archived' },
      authUserId,
    }).lean()

    if (existingStaff?.tenantId) {
      const company = await PartyCompanies.findById(existingStaff.tenantId).lean()
      return NextResponse.json({
        success: true,
        data: {
          created: false,
          tenantId: String(existingStaff.tenantId),
          company,
          staff: existingStaff,
        },
      })
    }

    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim()
        : 'Моя компания'

    const company = await PartyCompanies.create({
      title,
      phone,
      email,
      status: 'active',
    })

    company.tenantId = company._id
    await company.save()

    const staff = await PartyStaff.create({
      tenantId: company._id,
      authUserId,
      phone,
      email,
      firstName: sessionUser.firstName || '',
      secondName: sessionUser.secondName || '',
      role: PARTY_STAFF_ROLES.OWNER,
      status: 'active',
      lastLoginAt: new Date(),
    })

    const initialLocation = normalizeInitialLocation(body.initialLocation)
    const location = initialLocation
      ? await PartyLocations.create({
          ...initialLocation,
          tenantId: company._id,
          status: 'active',
        })
      : null

    const initialStaff = normalizeInitialStaff(body.initialStaff)
    const extraStaff = initialStaff
      ? await PartyStaff.create({
          ...initialStaff,
          tenantId: company._id,
        })
      : null

    return NextResponse.json(
      {
        success: true,
        data: {
          created: true,
          tenantId: String(company._id),
          company,
          staff,
          location,
          extraStaff,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'partycrm_bootstrap_failed',
          type: 'server',
          message: error.message,
        },
      },
      { status: 500 }
    )
  }
}
