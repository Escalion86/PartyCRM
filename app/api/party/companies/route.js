import { NextResponse } from 'next/server'
import { getPartySessionUser } from '@server/partyAuth'
import {
  PARTY_STAFF_ROLES,
  getPartyCompanyModel,
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

    const authUserId = String(sessionUser._id)
    const phone = normalizePhone(sessionUser.phone)
    const email = normalizeEmail(sessionUser.email)
    const title = normalizeText(body.title) || 'Новая компания'

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
      firstName: normalizeText(sessionUser.firstName, 100),
      secondName: normalizeText(sessionUser.secondName, 100),
      role: PARTY_STAFF_ROLES.OWNER,
      status: 'active',
      lastLoginAt: new Date(),
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          created: true,
          tenantId: String(company._id),
          company,
          staff,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'partycrm_company_create_failed',
          type: 'server',
          message: error.message,
        },
      },
      { status: 500 }
    )
  }
}
