import { NextResponse } from "next/server"
import { getPartySessionUser } from "@server/partyAuth"
import { getPartyPaymentModel } from "@server/partyModels"

export const GET = async (req) => {
  const user = await getPartySessionUser()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: "Не авторизован" },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 100)
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10)

  const PartyPayments = await getPartyPaymentModel()
  const payments = await PartyPayments.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean()

  return NextResponse.json({ success: true, data: payments }, { status: 200 })
}

export const dynamic = "force-dynamic"
