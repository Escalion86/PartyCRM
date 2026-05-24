const SBP_BONUS_RATE = 0.02

const isSbpBonusEnabled = () => process.env.BILLING_SBP_BONUS_ENABLED === 'true'

const getSbpBonusAmount = (amount) => {
  if (!isSbpBonusEnabled()) return 0
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * SBP_BONUS_RATE * 100) / 100
}

export { SBP_BONUS_RATE, getSbpBonusAmount, isSbpBonusEnabled }
