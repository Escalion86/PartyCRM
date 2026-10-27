export const PARTY_ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'
export const PARTY_ACTIVE_COMPANY_EVENT = 'partycrm:company-changed'
export const PARTY_ACTIVE_COMPANY_BEFORE_EVENT = 'partycrm:company-changing'

export const readPartyActiveCompanyId = (companies = [], fallbackId = '') => {
  const ids = companies.map((company) =>
    String(company.id || company.tenantId || company._id || company)
  )
  let stored = ''
  try {
    stored = window.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY) || ''
  } catch {}
  return ids.includes(stored)
    ? stored
    : ids.includes(String(fallbackId))
      ? String(fallbackId)
      : ids[0] || ''
}

export const publishPartyActiveCompanyId = (
  companyId,
  { skipGuard = false, persist = true } = {}
) => {
  if (typeof window === 'undefined' || !companyId) return false
  const id = String(companyId)
  let previousCompanyId = ''
  try {
    previousCompanyId =
      window.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY) || ''
  } catch {}
  if (
    !skipGuard &&
    !window.dispatchEvent(
      new CustomEvent(PARTY_ACTIVE_COMPANY_BEFORE_EVENT, {
        cancelable: true,
        detail: { companyId: id, previousCompanyId },
      })
    )
  )
    return false
  if (persist)
    try {
      window.localStorage.setItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY, id)
    } catch {}
  window.dispatchEvent(
    new CustomEvent(PARTY_ACTIVE_COMPANY_EVENT, { detail: { companyId: id } })
  )
  return true
}
