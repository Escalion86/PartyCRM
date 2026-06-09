import {
  getPartyCompanyModel,
  getPartyPaymentModel,
  getPartyTariffModel,
} from './partyModels'
import {
  addMonths,
  buildPartyCompanyTrialActivationState,
  buildPartyCompanyTariffPurchaseState,
} from './partyCompanyBillingCore'

const applyPartyCompanyTariffPurchase = async ({
  companyId,
  tariffId,
  initiatedByUserId = null,
}) => {
  if (!companyId || !tariffId) {
    return { ok: false, error: 'Не указана компания или тариф' }
  }

  const PartyCompanies = await getPartyCompanyModel()
  const PartyTariffs = await getPartyTariffModel()
  const PartyPayments = await getPartyPaymentModel()

  const company = await PartyCompanies.findById(companyId)
  if (!company) return { ok: false, error: 'Компания не найдена' }

  const tariff = await PartyTariffs.findById(tariffId).lean()
  if (!tariff) return { ok: false, error: 'Тариф не найден' }

  const state = buildPartyCompanyTariffPurchaseState({ company, tariff })
  if (!state.ok) return state

  Object.assign(company, state.nextCompany)
  await company.save()

  if (state.chargeAmount > 0) {
    await PartyPayments.create({
      userId: initiatedByUserId || null,
      tenantId: company._id,
      tariffId: tariff._id,
      amount: state.chargeAmount,
      type: 'charge',
      source: 'system',
      status: 'succeeded',
      purpose: 'tariff',
      comment: `Оплата тарифа "${tariff.title}"`,
    })
  }

  return { ok: true, company, tariff }
}

const ensurePartyFreeTariff = async () => {
  const PartyTariffs = await getPartyTariffModel()
  let freeTariff = await PartyTariffs.findOne({
    price: { $in: [0, '0', null] },
    hidden: { $ne: true },
  }).sort({ createdAt: 1 })

  if (!freeTariff) {
    freeTariff = await PartyTariffs.create({
      title: 'Бесплатный',
      subtitle: 'Базовые возможности',
      price: 0,
      description: 'Бесплатный тариф для начала работы',
      features: ['До 3 сотрудников', 'До 30 заказов в месяц', 'Учет клиентов'],
      hidden: false,
    })
  }

  return freeTariff
}

const assignDefaultPartyCompanyTariff = async ({
  companyId,
  initiatedByUserId = null,
}) => {
  const freeTariff = await ensurePartyFreeTariff()
  return applyPartyCompanyTariffPurchase({
    companyId,
    tariffId: freeTariff._id,
    initiatedByUserId,
  })
}

const activatePartyCompanyTrial = async ({
  companyId,
  days = 14,
  now = new Date(),
}) => {
  if (!companyId) return { ok: false, error: 'Не указана компания' }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(companyId)
  const state = buildPartyCompanyTrialActivationState({ company, days, now })
  if (!state.ok) return state

  Object.assign(company, state.nextCompany)
  await company.save()

  return { ok: true, company }
}

const applyPartyTariffPurchase = async ({
  companyId,
  userId,
  tariffId,
  initiatedByUserId,
}) =>
  applyPartyCompanyTariffPurchase({
    companyId,
    tariffId,
    initiatedByUserId: initiatedByUserId || userId || null,
  })

export {
  addMonths,
  activatePartyCompanyTrial,
  applyPartyCompanyTariffPurchase,
  applyPartyTariffPurchase,
  assignDefaultPartyCompanyTariff,
  ensurePartyFreeTariff,
}
