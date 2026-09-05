import { getPartyRequestContext, partyError } from './partyApi'
import getPartyCompanyTariffAccessState from './getPartyCompanyTariffAccess'

export const getPartyTelegramRequestContext = async (req) => {
  const result = await getPartyRequestContext({ req, managementOnly: true })
  if (result.error) return result
  const tariff = await getPartyCompanyTariffAccessState(result.context.tenantId)
  if (!tariff.access?.allowTelegramIntegration) {
    return {
      context: result.context,
      error: partyError(403, 'partycrm_telegram_tariff_required', 'Telegram недоступен на текущем тарифе компании', 'tariff'),
    }
  }
  return { ...result, tariff }
}
