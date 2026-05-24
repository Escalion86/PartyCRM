import Users from '@models/Users'
import Tariffs from '@models/Tariffs'
import {
  findUserByPhone,
  isValidNormalizedPhone,
  normalizePhone,
} from '@server/phoneVerification'

const normalizeEmail = (value) => {
  if (!value) return ''
  return String(value).trim().toLowerCase()
}

const buildPatch = (user, profile) => {
  const patch = {}
  if (profile.vkId && user.vkId !== profile.vkId) patch.vkId = profile.vkId
  if (profile.email && !user.email) patch.email = profile.email
  if (profile.firstName && !user.firstName) patch.firstName = profile.firstName
  if (profile.secondName && !user.secondName)
    patch.secondName = profile.secondName
  if (
    profile.image &&
    (!Array.isArray(user.images) || user.images.length === 0)
  ) {
    patch.images = [profile.image]
  }
  if (!user.registrationType) patch.registrationType = 'vk'
  return patch
}

export const ensureVkUser = async ({
  vkId = '',
  phone = '',
  email = '',
  firstName = '',
  secondName = '',
  image = '',
}) => {
  const normalizedVkId = String(vkId || '').trim()
  const normalizedPhone = normalizePhone(phone)
  if (!isValidNormalizedPhone(normalizedPhone)) return null
  const normalizedEmail = normalizeEmail(email)

  let user = await findUserByPhone(normalizedPhone)

  if (!user) {
    if (normalizedVkId) {
      await Users.updateMany({ vkId: normalizedVkId }, { $unset: { vkId: 1 } })
    }

    const cheapestTariff = await Tariffs.findOne({
      hidden: { $ne: true },
    })
      .sort({ price: 1, title: 1 })
      .lean()

    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    try {
      user = await Users.create({
        ...(normalizedVkId ? { vkId: normalizedVkId } : {}),
        email: normalizedEmail,
        phone: normalizedPhone,
        firstName,
        secondName,
        images: image ? [image] : [],
        registrationType: 'vk',
        role: 'user',
        tenantId: null,
        tariffId: cheapestTariff?._id ?? null,
        trialActivatedAt: now,
        trialEndsAt,
        trialUsed: true,
        consentPrivacyPolicyAccepted: true,
        consentPersonalDataAccepted: true,
        privacyPolicyAcceptedAt: now,
        personalDataProcessingAcceptedAt: now,
      })
    } catch (error) {
      if (error?.code === 11000) {
        const conflictByPhone = await findUserByPhone(normalizedPhone)
        if (!conflictByPhone) throw error
        user = conflictByPhone
      } else {
        throw error
      }
    }
  } else {
    if (normalizedVkId) {
      await Users.updateMany(
        { _id: { $ne: user._id }, vkId: normalizedVkId },
        { $unset: { vkId: 1 } }
      )
    }

    const patch = buildPatch(user, {
      vkId: normalizedVkId,
      phone: normalizedPhone,
      email: normalizedEmail,
      firstName,
      secondName,
      image,
    })

    if (Object.keys(patch).length > 0) {
      user = await Users.findByIdAndUpdate(
        user._id,
        { $set: patch },
        { returnDocument: 'after' }
      )
    }
  }

  if (!user.tenantId) {
    user = await Users.findByIdAndUpdate(
      user._id,
      { $set: { tenantId: user._id } },
      { returnDocument: 'after' }
    )
  }

  return user
}
