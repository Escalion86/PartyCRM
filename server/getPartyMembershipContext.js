import { getPartySessionUser } from './partyAuth'
import { getPartyCompanyModel, getPartyStaffModel } from './partyModels'

const rolePriority = {
  owner: 0,
  admin: 1,
  performer: 2,
}

const sanitizeStaff = (staff) => {
  if (!staff) return null
  const data = typeof staff.toObject === 'function' ? staff.toObject() : staff
  return {
    ...data,
    _id: String(data._id),
    tenantId: data.tenantId ? String(data.tenantId) : null,
  }
}

const sanitizeCompany = (company) => {
  if (!company) return null
  const data =
    typeof company.toObject === 'function' ? company.toObject() : company
  return {
    ...data,
    _id: String(data._id),
    tenantId: data.tenantId ? String(data.tenantId) : null,
  }
}

const buildMembership = (staff, company) => {
  const sanitizedStaff = sanitizeStaff(staff)
  const sanitizedCompany = sanitizeCompany(company)

  return {
    staffId: sanitizedStaff._id,
    tenantId: sanitizedStaff.tenantId,
    role: sanitizedStaff.role,
    status: sanitizedStaff.status,
    isOwner: sanitizedStaff.role === 'owner',
    isAdmin: ['owner', 'admin'].includes(sanitizedStaff.role),
    isPerformer: sanitizedStaff.role === 'performer',
    staff: sanitizedStaff,
    company: sanitizedCompany,
  }
}

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

  const memberships = staffItems
    .map((staff) => buildMembership(staff, companiesById.get(String(staff.tenantId))))
    .filter((membership) => membership.company)
    .sort((first, second) => {
      const firstRole = rolePriority[first.role] ?? 99
      const secondRole = rolePriority[second.role] ?? 99
      if (firstRole !== secondRole) return firstRole - secondRole
      return first.company.title.localeCompare(second.company.title, 'ru')
    })

  return {
    session: sessionUser ? { user: sessionUser } : null,
    sessionUser,
    memberships,
  }
}

export default getPartyMembershipContext
