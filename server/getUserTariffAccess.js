import Tariffs from '@models/Tariffs'
import Users from '@models/Users'
import dbConnect from './dbConnect'
import { isTrialActive } from '@helpers/tariffAccess'

const buildAccess = (user, tariff) => {
  const trialActive = isTrialActive(user)
  return {
    user,
    tariff,
    trialActive,
    hasTariff: Boolean(tariff),
    allowCalendarSync: trialActive || Boolean(tariff?.allowCalendarSync),
    allowStatistics: trialActive || Boolean(tariff?.allowStatistics),
    allowDocuments: trialActive || Boolean(tariff?.allowDocuments),
    allowTelephony: Boolean(tariff?.allowTelephony),
    allowAi: Boolean(tariff?.allowAi),
    eventsPerMonth: trialActive ? Infinity : Number(tariff?.eventsPerMonth ?? 0),
  }
}

const getUserTariffAccess = async (userId) => {
  if (!userId) return null
  await dbConnect()
  const user = await Users.findById(userId).lean()
  if (!user) return null
  const tariff = user.tariffId
    ? await Tariffs.findById(user.tariffId).lean()
    : null
  return buildAccess(user, tariff)
}

export default getUserTariffAccess
