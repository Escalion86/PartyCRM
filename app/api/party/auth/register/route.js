import { NextResponse } from 'next/server'
import { getPartyUserModel, getPartyTariffModel } from '@server/partyModels'
import {
  hashPartyPassword,
  normalizePartyEmail,
  normalizePartyInterfaceRoles,
  normalizePartyPhone,
  setPartySessionCookie,
} from '@server/partyAuth'
import { applyPartyTariffPurchase } from '@server/partyBilling'

const assignDefaultFreeTariff = async (userId) => {
  const PartyTariffs = await getPartyTariffModel()
  let freeTariff = await PartyTariffs.findOne({
    price: { $in: [0, '0', null] },
    hidden: { $ne: true },
  }).sort({ createdAt: 1 })

  if (!freeTariff) {
    freeTariff = await PartyTariffs.create({
      title: '╨С╨╡╤Б╨┐╨╗╨░╤В╨╜╤Л╨╣',
      subtitle: '╨С╨░╨╖╨╛╨▓╤Л╨╡ ╨▓╨╛╨╖╨╝╨╛╨╢╨╜╨╛╤Б╤В╨╕',
      price: 0,
      description: '╨С╨╡╤Б╨┐╨╗╨░╤В╨╜╤Л╨╣ ╤В╨░╤А╨╕╤Д ╨┤╨╗╤П ╨╜╨░╤З╨░╨╗╨░ ╤А╨░╨▒╨╛╤В╤Л',
      features: ['╨Ф╨╛ 3 ╤Б╨╛╤В╤А╤Г╨┤╨╜╨╕╨║╨╛╨▓', '╨Ф╨╛ 30 ╨╖╨░╨║╨░╨╖╨╛╨▓ ╨▓ ╨╝╨╡╤Б╤П╤Ж', '╨г╤З╤С╤В ╨║╨╗╨╕╨╡╨╜╤В╨╛╨▓'],
      hidden: false,
    })
  }

  const result = await applyPartyTariffPurchase({
    userId,
    tariffId: freeTariff._id,
  })
  if (!result.ok) {
    console.error('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╜╨░╨╖╨╜╨░╤З╨╕╤В╤М ╨▒╨╡╤Б╨┐╨╗╨░╤В╨╜╤Л╨╣ ╤В╨░╤А╨╕╤Д ╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤О', userId, result.error)
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePartyPhone(body.phone)
  const password = String(body.password || '')
  const interfaceRoles = normalizePartyInterfaceRoles(body.interfaceRoles)
  const consentPrivacyPolicy = body?.consentPrivacyPolicy === true
  const consentPersonalData = body?.consentPersonalData === true

  if (!phone || !password) {
    return NextResponse.json(
      { success: false, error: '╨г╨║╨░╨╢╨╕╤В╨╡ ╤В╨╡╨╗╨╡╤Д╨╛╨╜ ╨╕ ╨┐╨░╤А╨╛╨╗╤М' },
      { status: 400 }
    )
  }
  if (phone.length !== 11) {
    return NextResponse.json(
      { success: false, error: '╨Э╨╡╨║╨╛╤А╤А╨╡╨║╤В╨╜╤Л╨╣ ╨╜╨╛╨╝╨╡╤А ╤В╨╡╨╗╨╡╤Д╨╛╨╜╨░' },
      { status: 400 }
    )
  }
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, error: '╨Я╨░╤А╨╛╨╗╤М ╨┤╨╛╨╗╨╢╨╡╨╜ ╨▒╤Л╤В╤М ╨╜╨╡ ╨╝╨╡╨╜╨╡╨╡ 8 ╤Б╨╕╨╝╨▓╨╛╨╗╨╛╨▓' },
      { status: 400 }
    )
  }
  if (!consentPrivacyPolicy || !consentPersonalData) {
    return NextResponse.json(
      {
        success: false,
        error:
          '╨Ф╨╗╤П ╤А╨╡╨│╨╕╤Б╤В╤А╨░╤Ж╨╕╨╕ ╤В╤А╨╡╨▒╤Г╨╡╤В╤Б╤П ╤Б╨╛╨│╨╗╨░╤Б╨╕╨╡ ╤Б ╨Я╨╛╨╗╨╕╤В╨╕╨║╨╛╨╣ ╨║╨╛╨╜╤Д╨╕╨┤╨╡╨╜╤Ж╨╕╨░╨╗╤М╨╜╨╛╤Б╤В╨╕ ╨╕ ╨╛╨▒╤А╨░╨▒╨╛╤В╨║╨╛╨╣ ╨┐╨╡╤А╤Б╨╛╨╜╨░╨╗╤М╨╜╤Л╤Е ╨┤╨░╨╜╨╜╤Л╤Е',
      },
      { status: 400 }
    )
  }

  const PartyUsers = await getPartyUserModel()
  const existingUser = await PartyUsers.findOne({ phone }).lean()
  if (existingUser) {
    return NextResponse.json(
      { success: false, error: '╨Я╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤М PartyCRM ╤Б ╤В╨░╨║╨╕╨╝ ╨╜╨╛╨╝╨╡╤А╨╛╨╝ ╤Г╨╢╨╡ ╤Б╤Г╤Й╨╡╤Б╤В╨▓╤Г╨╡╤В' },
      { status: 409 }
    )
  }

  let user = null
  try {
    const now = new Date()
    user = await PartyUsers.create({
      phone,
      email: normalizePartyEmail(body.email),
      password: await hashPartyPassword(password),
      firstName: String(body.firstName || '').trim().slice(0, 100),
      secondName: String(body.secondName || '').trim().slice(0, 100),
      interfaceRoles,
      consentPrivacyPolicyAccepted: true,
      consentPersonalDataAccepted: true,
      privacyPolicyAcceptedAt: now,
      personalDataProcessingAcceptedAt: now,
      lastLoginAt: now,
    })
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          error: '╨Я╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╨╡╨╗╤М PartyCRM ╤Б ╤В╨░╨║╨╕╨╝ ╨╜╨╛╨╝╨╡╤А╨╛╨╝ ╤Г╨╢╨╡ ╤Б╤Г╤Й╨╡╤Б╤В╨▓╤Г╨╡╤В',
        },
        { status: 409 }
      )
    }
    throw error
  }

  // ╨Э╨░╨╖╨╜╨░╤З╨░╨╡╨╝ ╨▒╨╡╤Б╨┐╨╗╨░╤В╨╜╤Л╨╣ ╤В╨░╤А╨╕╤Д ╨┐╨╛ ╤Г╨╝╨╛╨╗╤З╨░╨╜╨╕╤О (╨╜╨╡ ╨▒╨╗╨╛╨║╨╕╤А╤Г╨╡╨╝ ╤А╨╡╨│╨╕╤Б╤В╤А╨░╤Ж╨╕╤О ╨┐╤А╨╕ ╨╛╤И╨╕╨▒╨║╨╡)
  assignDefaultFreeTariff(user._id).catch((err) =>
    console.error('assignDefaultFreeTariff error:', err)
  )

  const response = NextResponse.json(
    {
      success: true,
      data: {
        user: {
          _id: String(user._id),
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          secondName: user.secondName,
          interfaceRoles: normalizePartyInterfaceRoles(user.interfaceRoles),
        },
      },
    },
    { status: 201 }
  )
  return setPartySessionCookie(response, user)
}
