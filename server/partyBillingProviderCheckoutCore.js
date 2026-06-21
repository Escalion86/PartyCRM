export const PARTY_BALANCE_TOP_UP_MIN_AMOUNT = 100
export const PARTY_BALANCE_TOP_UP_MAX_AMOUNT = 300000

export const buildPartyBalanceTopUpPaymentDraft = (body = {}) => {
  const purpose = body?.purpose || 'balance'
  if (purpose !== 'balance') {
    return {
      ok: false,
      status: 400,
      error: 'Оплата тарифа выполняется списанием с баланса компании',
    }
  }

  const amount = Math.floor(Number(body?.amount ?? 0))
  if (
    !Number.isFinite(amount) ||
    amount < PARTY_BALANCE_TOP_UP_MIN_AMOUNT ||
    amount > PARTY_BALANCE_TOP_UP_MAX_AMOUNT
  ) {
    return {
      ok: false,
      status: 400,
      error: `Сумма должна быть от ${PARTY_BALANCE_TOP_UP_MIN_AMOUNT} до ${PARTY_BALANCE_TOP_UP_MAX_AMOUNT} руб.`,
    }
  }

  return {
    ok: true,
    purpose: 'balance',
    amount,
    description: 'Пополнение баланса PartyCRM',
  }
}
