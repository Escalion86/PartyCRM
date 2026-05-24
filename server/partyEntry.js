import { normalizePartyInterfaceRoles } from './partyAuth'

export const PARTY_WORKSPACE_TYPES = Object.freeze({
  COMPANY: 'company',
  PERFORMER: 'performer',
})

export const normalizePartyWorkspace = (value) =>
  [PARTY_WORKSPACE_TYPES.COMPANY, PARTY_WORKSPACE_TYPES.PERFORMER].includes(
    value
  )
    ? value
    : ''

const normalizeRoles = (value) => normalizePartyInterfaceRoles(value)

export const hasPartyManagementAccess = (memberships = []) =>
  memberships.some((membership) => membership?.isAdmin)

export const hasPartyPerformerRole = (roles = []) =>
  normalizeRoles(roles).includes(PARTY_WORKSPACE_TYPES.PERFORMER)

export const hasPartyCompanyRole = (roles = []) =>
  normalizeRoles(roles).includes(PARTY_WORKSPACE_TYPES.COMPANY)

export const getPartyEntryState = ({ user = null, memberships = [] } = {}) => {
  const roles = normalizeRoles(user?.interfaceRoles)
  const lastWorkspace = normalizePartyWorkspace(user?.lastWorkspace)
  const canUseCompany = roles.includes(PARTY_WORKSPACE_TYPES.COMPANY)
  const canUsePerformer = roles.includes(PARTY_WORKSPACE_TYPES.PERFORMER)
  const companyReady = canUseCompany && hasPartyManagementAccess(memberships)
  const performerReady =
    canUsePerformer && Boolean(user?.performerOnboardingCompletedAt)

  return {
    roles,
    lastWorkspace,
    canUseCompany,
    canUsePerformer,
    companyReady,
    performerReady,
    needsRoleSelection: roles.length === 0,
  }
}

export const resolvePartyEntryPath = ({ user = null, memberships = [] } = {}) => {
  const state = getPartyEntryState({ user, memberships })

  if (state.needsRoleSelection) {
    return '/party/start'
  }

  const preferredWorkspace =
    state.lastWorkspace ||
    (state.canUseCompany
      ? PARTY_WORKSPACE_TYPES.COMPANY
      : PARTY_WORKSPACE_TYPES.PERFORMER)

  if (preferredWorkspace === PARTY_WORKSPACE_TYPES.COMPANY) {
    if (!state.companyReady) return '/company/master'
    return '/company'
  }

  if (!state.performerReady) return '/performer/master'
  return '/performer'
}
