export const getPartyTicketingSettings = (companyOrSettings = {}) => {
  const settings = companyOrSettings?.settings || companyOrSettings || {}
  return { enabled: settings.modules?.ticketing?.enabled === true }
}

export const isPartyTicketingEnabled = (companyOrSettings) =>
  getPartyTicketingSettings(companyOrSettings).enabled
