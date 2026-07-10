import { getPartySessionUser } from './partyAuth'
import { getPartyCompanyModel, getPartyStaffModel } from './partyModels'
import {
  buildPartyDeveloperMemberships,
  buildPartyMembership,
  sortPartyMemberships,
} from './partyMembershipCore'

const getPartyMembershipContext = async () => {
  const sessionUser = await getPartySessionUser()
  const authUserId = sessionUser?._id ? String(sessionUser._id) : ''

  if (!authUserId) {
    return {
      session: null,
      sessionUser,
      memberships: [],
    }
  }

  const PartyStaff = await getPartyStaffModel()
  const PartyCompanies = await getPartyCompanyModel()
  const staffItems = await PartyStaff.find({
    authUserId,
    status: { $ne: 'archived' },
  })
    .sort({ role: 1, createdAt: 1 })
    .lean()

  const isDeveloper = sessionUser?.role === 'dev'
  const tenantIds = isDeveloper
    ? []
    : [
        ...new Set(
          staffItems.map((staff) => String(staff.tenantId)).filter(Boolean)
        ),
      ]
  const companies = isDeveloper
    ? await PartyCompanies.find({ status: { $ne: 'archived' } }).lean()
    : tenantIds.length
      ? await PartyCompanies.find({
          _id: { $in: tenantIds },
          status: { $ne: 'archived' },
        }).lean()
      : []
  const companiesById = new Map(
    companies.map((company) => [String(company._id), company])
  )

  const staffMemberships = staffItems
    .map((staff) =>
      buildPartyMembership(staff, companiesById.get(String(staff.tenantId)))
    )
    .filter((membership) => membership.company)
  const developerMemberships = isDeveloper
    ? buildPartyDeveloperMemberships({ sessionUser, companies })
    : []
  const memberships = sortPartyMemberships([
    ...developerMemberships,
    ...staffMemberships,
  ])

  return {
    session: sessionUser ? { user: sessionUser } : null,
    sessionUser,
    memberships,
  }
}

export default getPartyMembershipContext
