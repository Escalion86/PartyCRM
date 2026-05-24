'use client'

export const YANDEX_METRIKA_ID = 108801563

const canSendMetrikaGoal = () =>
  typeof window !== 'undefined' && typeof window.ym === 'function'

export const reachGoal = (goalName, params) => {
  if (!goalName || !canSendMetrikaGoal()) return false
  window.ym(YANDEX_METRIKA_ID, 'reachGoal', goalName, params)
  return true
}

export const reachGoalOnce = (goalName, params) => {
  if (typeof window === 'undefined') return false
  const key = `artistcrm:metrika-goal:${goalName}`
  if (window.localStorage.getItem(key) === '1') return false
  const sent = reachGoal(goalName, params)
  if (sent) window.localStorage.setItem(key, '1')
  return sent
}
