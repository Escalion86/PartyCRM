import {
  getPartyCompanyTariffAccess,
  serializePartyTariffAccess,
} from '@helpers/partyTariffAccess'
import { getPartyCompanyModel, getPartyTariffModel } from './partyModels'

const getPartyCompanyTariffAccessState = async (companyOrId) => {
  const PartyCompanies = await getPartyCompanyModel()
  const PartyTariffs = await getPartyTariffModel()
  const company =
    typeof companyOrId === 'object' && companyOrId?._id
      ? companyOrId
      : await PartyCompanies.findById(companyOrId).lean()
  const tariff = company?.tariffId
    ? await PartyTariffs.findById(company.tariffId).lean()
    : null
  const access = getPartyCompanyTariffAccess(company, tariff ? [tariff] : [])

  return {
    company,
    tariff,
    access,
    serializedAccess: serializePartyTariffAccess(access),
  }
}

export default getPartyCompanyTariffAccessState
