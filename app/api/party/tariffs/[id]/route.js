import { NextResponse } from "next/server"
import { getPartySessionUser } from "@server/partyAuth"
import { getPartyTariffModel } from "@server/partyModels"

const canManage = (user) => ["support", "admin"].includes(user?.role)

export const PATCH = async (req, { params }) => {
  const user = await getPartySessionUser()
  if (!user?._id || !canManage(user)) {
    return NextResponse.json(
      { success: false, error: "Нет доступа" },
      { status: 403 }
    )
  }

  const { id } = await params
  const body = await req.json()
  const PartyTariffs = await getPartyTariffModel()
  const tariff = await PartyTariffs.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  })
  if (!tariff) {
    return NextResponse.json(
      { success: false, error: "Тариф не найден" },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true, data: tariff }, { status: 200 })
}

export const DELETE = async (req, { params }) => {
  const user = await getPartySessionUser()
  if (!user?._id || !canManage(user)) {
    return NextResponse.json(
      { success: false, error: "Нет доступа" },
      { status: 403 }
    )
  }

  const { id } = await params
  const PartyTariffs = await getPartyTariffModel()
  const tariff = await PartyTariffs.findByIdAndDelete(id)
  if (!tariff) {
    return NextResponse.json(
      { success: false, error: "Тариф не найден" },
      { status: 404 }
    )
  }
  return NextResponse.json({ success: true }, { status: 200 })
}

export const dynamic = "force-dynamic"
