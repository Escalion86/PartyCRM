import { getPartySessionUser } from './partyAuth'
import { getPartyCompanyModel, getPartyStaffModel, getPartyRoleModel } from './partyModels'
import {
  buildPartyDeveloperMemberships,
  buildPartyMembership,
  sortPartyMemberships,
} from './partyMembershipCore'

const getPartyMembershipContext = async ({
  excludeLocationOwners = false,
} = {}) => {
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
    ...(excludeLocationOwners ? { role: { $ne: 'location_owner' } } : {}),
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

  // Reload positions on every request: revocation must not depend on a cached session.
  const Roles = await getPartyRoleModel()
  const positions = staffItems.length ? await Roles.find({ tenantId: { $in: [...new Set(staffItems.map((staff) => String(staff.tenantId)))] } }).lean() : []
  const positionFor = (staff) => staff.positionId
    ? positions.find((position) => String(position._id) === String(staff.positionId) && String(position.tenantId) === String(staff.tenantId))
    : positions.find((position) => position.systemKey === staff.role && String(position.tenantId) === String(staff.tenantId))

  const staffMemberships = staffItems
    .map((staff) =>
      buildPartyMembership(staff, companiesById.get(String(staff.tenantId)), positionFor(staff))
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
