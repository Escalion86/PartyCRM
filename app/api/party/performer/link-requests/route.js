import { NextResponse } from 'next/server'
import { getPartyCompanyModel, getPartyStaffModel } from '@server/partyModels'
import { partyError } from '@server/partyApi'
import { getPartySessionUser } from '@server/partyAuth'

const getDisplayName = (staff) =>
  [staff.secondName, staff.firstName].filter(Boolean).join(' ') ||
  staff.phone ||
  'Исполнитель'

export async function GET() {
  const sessionUser = await getPartySessionUser()

  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Не авторизован', 'auth')
  }

  const PartyStaff = await getPartyStaffModel()
  const requests = await PartyStaff.find({
    linkedAuthUserId: String(sessionUser._id),
    linkStatus: 'link_requested',
    status: { $ne: 'archived' },
  })
    .sort({ linkRequestedAt: -1, createdAt: -1 })
    .lean()

  if (requests.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const companyIds = [
    ...new Set(requests.map((request) => String(request.tenantId))),
  ]
  const PartyCompanies = await getPartyCompanyModel()
  const companies = await PartyCompanies.find({
    _id: { $in: companyIds },
  })
    .select('_id title')
    .lean()
  const companiesById = new Map(
    companies.map((company) => [String(company._id), company])
  )

  return NextResponse.json({
    success: true,
    data: requests.map((request) => {
      const company = companiesById.get(String(request.tenantId))
      return {
        _id: String(request._id),
        companyId: String(request.tenantId),
        companyTitle: company?.title || 'Компания',
        displayName: getDisplayName(request),
        firstName: request.firstName || '',
        secondName: request.secondName || '',
        phone: request.phone || '',
        email: request.email || '',
        specialization: request.specialization || '',
        linkRequestedAt: request.linkRequestedAt || null,
      }
    }),
  })
}
