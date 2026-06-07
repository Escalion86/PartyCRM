const addMonths = (date, count) => {
  const next = new Date(date)
  const day = next.getDate()
  next.setMonth(next.getMonth() + count)
  if (next.getDate() < day) {
    next.setDate(0)
  }
  return next
}

export const isPartyCompanyBalanceEnough = ({ balance, price }) => {
  const balanceValue = Number(balance ?? 0)
  const priceValue = Number(price ?? 0)
  return (
    Number.isFinite(balanceValue) &&
    Number.isFinite(priceValue) &&
    balanceValue >= priceValue
  )
}

export const buildPartyCompanyTariffPurchaseState = ({
  company,
  tariff,
  now = new Date(),
}) => {
  if (!company || !tariff?._id) {
    return { ok: false, error: 'Не указана компания или тариф' }
  }

  const price = Number(tariff.price ?? 0)
  const balance = Number(company.balance ?? 0)
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: 'Некорректная цена тарифа' }
  }

  if (!isPartyCompanyBalanceEnough({ balance, price })) {
    return {
      ok: false,
      error: `Недостаточно средств. Не хватает ${Math.max(price - balance, 0)} руб.`,
    }
  }

  if (price > 0) {
    const nextChargeAt = addMonths(now, 1)
    return {
      ok: true,
      chargeAmount: price,
      nextCompany: {
        tariffId: tariff._id,
        balance: balance - price,
        billingStatus: 'active',
        tariffActiveUntil: nextChargeAt,
        nextChargeAt,
      },
    }
  }

  return {
    ok: true,
    chargeAmount: 0,
    nextCompany: {
      tariffId: tariff._id,
      balance,
      billingStatus: 'active',
      tariffActiveUntil: null,
      nextChargeAt: null,
    },
  }
}

export { addMonths }
