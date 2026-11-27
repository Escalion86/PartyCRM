import { readPartyImpersonationMarker } from './partyImpersonationClient.js'

export const PARTY_ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'
export const PARTY_ACTIVE_COMPANY_EVENT = 'partycrm:company-changed'
export const PARTY_ACTIVE_COMPANY_BEFORE_EVENT = 'partycrm:company-changing'
const PREVIEW_COMPANY_STORAGE_KEY = 'partycrm.impersonation.activeCompany'
const previewMarker = readPartyImpersonationMarker()

export const readStoredPartyActiveCompanyId = (
  browser = typeof window === 'undefined' ? undefined : window
) => {
  if (!browser) return ''
  try {
    if (!previewMarker) {
      return browser.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY) || ''
    }
    const selection = JSON.parse(browser.sessionStorage.getItem(PREVIEW_COMPANY_STORAGE_KEY))
    return selection?.marker === previewMarker ? selection.companyId || '' : ''
  } catch {
    return ''
  }
}

export const readPartyActiveCompanyId = (companies = [], fallbackId = '') => {
  const ids = companies.map((company) =>
    String(company.id || company.tenantId || company._id || company)
  )
  const stored = readStoredPartyActiveCompanyId()
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
  const previousCompanyId = readStoredPartyActiveCompanyId()
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
      if (previewMarker) {
        window.sessionStorage.setItem(
          PREVIEW_COMPANY_STORAGE_KEY,
          JSON.stringify({ marker: previewMarker, companyId: id })
        )
      } else {
        window.localStorage.setItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY, id)
      }
    } catch {}
  window.dispatchEvent(
    new CustomEvent(PARTY_ACTIVE_COMPANY_EVENT, { detail: { companyId: id } })
  )
  return true
}
