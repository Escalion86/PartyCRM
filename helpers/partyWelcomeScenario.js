const formatDateLabel = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const getIncompleteSteps = (steps = [], limit = 3) =>
  steps.filter((step) => step && !step.completed).slice(0, limit)

export const getPartyActivationWelcomeScenario = ({
  billing = {},
  onboardingSteps = [],
} = {}) => {
  const access = billing?.access ?? {}
  const nextSteps = getIncompleteSteps(onboardingSteps)

  if (access.trialActive) {
    const trialEndsAt = formatDateLabel(billing.trialEndsAt)
    return {
      kind: 'trial',
      title: 'Пробный период активен',
      description: trialEndsAt
        ? `До ${trialEndsAt} доступны функции активного тарифа.`
        : 'Функции активного тарифа доступны на время пробного периода.',
      nextSteps,
    }
  }

  if (access.hasTariff) {
    const tariffTitle = billing.tariffTitle || 'компании'
    const activeUntil = formatDateLabel(billing.tariffActiveUntil)
    return {
      kind: 'paid',
      title: `Тариф ${tariffTitle} активирован`,
      description: activeUntil
        ? `Оплаченный период действует до ${activeUntil}.`
        : 'Компания может работать в рамках подключенного тарифа.',
      nextSteps,
    }
  }

  return null
}
