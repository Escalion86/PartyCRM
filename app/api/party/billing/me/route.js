import { NextResponse } from "next/server"
import { getPartySessionUser } from "@server/partyAuth"
import { getPartyUserModel } from "@server/partyModels"

export const GET = async () => {
  const user = await getPartySessionUser()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: "Не авторизован" },
      { status: 401 }
    )
  }

  const PartyUsers = await getPartyUserModel()
  const dbUser = await PartyUsers.findById(user._id)
    .select(
      "balance tariffId billingStatus tariffActiveUntil nextChargeAt trialActivatedAt trialEndsAt trialUsed"
    )
    .lean()

  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: "Пользователь не найден" },
      { status: 404 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        balance: dbUser.balance ?? 0,
        tariffId: dbUser.tariffId ? String(dbUser.tariffId) : null,
        billingStatus: dbUser.billingStatus ?? "active",
        tariffActiveUntil: dbUser.tariffActiveUntil ?? null,
        nextChargeAt: dbUser.nextChargeAt ?? null,
        trialActivatedAt: dbUser.trialActivatedAt ?? null,
        trialEndsAt: dbUser.trialEndsAt ?? null,
        trialUsed: dbUser.trialUsed ?? false,
      },
    },
    { status: 200 }
  )
}

export const dynamic = "force-dynamic"
