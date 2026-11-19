import { isPartyCompanyModuleEnabled } from './partyCompanyModules.js'

export const getPartyTicketingSettings = (companyOrSettings = {}) => {
  const settings = companyOrSettings?.settings || companyOrSettings || {}
  return { enabled: isPartyCompanyModuleEnabled(settings, 'ticketing') }
}

export const isPartyTicketingEnabled = (companyOrSettings) =>
  getPartyTicketingSettings(companyOrSettings).enabled
