const rolePriority = {
  owner: 0,
  admin: 1,
  performer: 2,
}

const sanitizeDocument = (document) => {
  if (!document) return null
  const data =
    typeof document.toObject === 'function' ? document.toObject() : document
  return {
    ...data,
    _id: String(data._id),
    tenantId: data.tenantId ? String(data.tenantId) : null,
  }
}

export const sanitizePartyStaff = (staff) => sanitizeDocument(staff)

export const sanitizePartyCompany = (company) => sanitizeDocument(company)

export const buildPartyMembership = (staff, company) => {
  const sanitizedStaff = sanitizePartyStaff(staff)
  const sanitizedCompany = sanitizePartyCompany(company)

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

const buildDeveloperStaff = ({ sessionUser, company }) => {
  const userId = String(sessionUser?._id || '')
  const companyId = String(company?._id || '')

  return {
    _id: `dev:${userId}:${companyId}`,
    tenantId: companyId,
    authUserId: userId,
    linkedAuthUserId: userId,
    firstName: sessionUser?.firstName || '',
    secondName: sessionUser?.secondName || '',
    phone: sessionUser?.phone || '',
    email: sessionUser?.email || '',
    specialization: '',
    description: '',
    role: 'owner',
    status: 'active',
    visibleToPerformer: false,
    linkStatus: 'linked',
    isDeveloperAccess: true,
  }
}

export const sortPartyMemberships = (memberships = []) =>
  [...memberships].sort((first, second) => {
    const firstRole = rolePriority[first.role] ?? 99
    const secondRole = rolePriority[second.role] ?? 99
    if (firstRole !== secondRole) return firstRole - secondRole
    return (first.company?.title || '').localeCompare(
      second.company?.title || '',
      'ru'
    )
  })

export const buildPartyDeveloperMemberships = ({
  sessionUser = null,
  companies = [],
} = {}) => {
  if (sessionUser?.role !== 'dev') return []

  return sortPartyMemberships(
    companies
      .filter((company) => company?.status !== 'archived')
      .map((company) => {
        const sanitizedCompany = sanitizePartyCompany(company)
        const staff = buildDeveloperStaff({
          sessionUser,
          company: sanitizedCompany,
        })

        return {
          ...buildPartyMembership(staff, sanitizedCompany),
          isDeveloperAccess: true,
          staff: {
            ...staff,
            isDeveloperAccess: true,
          },
        }
      })
  )
}
