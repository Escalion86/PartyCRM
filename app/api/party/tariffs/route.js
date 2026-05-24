import { NextResponse } from "next/server"
import { getPartySessionUser } from "@server/partyAuth"
import { getPartyTariffModel } from "@server/partyModels"

const canManage = (user) => ["support", "admin"].includes(user?.role)

export const GET = async () => {
  const user = await getPartySessionUser()
  const PartyTariffs = await getPartyTariffModel()

  if (user?._id && canManage(user)) {
    // Admin: all tariffs
    const tariffs = await PartyTariffs.find({})
      .sort({ price: 1, title: 1 })
      .lean()
    return NextResponse.json({ success: true, data: tariffs }, { status: 200 })
  }

  // Regular user: visible tariffs only
  const tariffs = await PartyTariffs.find({ hidden: { $ne: true } })
    .sort({ price: 1, title: 1 })
    .lean()
  return NextResponse.json({ success: true, data: tariffs }, { status: 200 })
}

export const POST = async (req) => {
  const user = await getPartySessionUser()
  if (!user?._id || !canManage(user)) {
    return NextResponse.json(
      { success: false, error: "Нет доступа" },
      { status: 403 }
    )
  }

  const body = await req.json()
  const PartyTariffs = await getPartyTariffModel()
  const tariff = await PartyTariffs.create(body)
  return NextResponse.json({ success: true, data: tariff }, { status: 201 })
}

export const dynamic = "force-dynamic"
