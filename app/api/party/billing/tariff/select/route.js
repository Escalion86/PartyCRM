import { NextResponse } from "next/server"
import { getPartyRequestContext } from "@server/partyApi"
import { applyPartyCompanyTariffPurchase } from "@server/partyBilling"
import { getPartyTariffModel } from "@server/partyModels"

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyTariffs = await getPartyTariffModel()
  const tariff = await PartyTariffs.findById(body?.tariffId).lean()
  if (!tariff || tariff.hidden) {
    return NextResponse.json(
      { success: false, error: "Тариф не найден" },
      { status: 404 }
    )
  }

  const result = await applyPartyCompanyTariffPurchase({
    companyId: context.tenantId,
    initiatedByUserId: context.sessionUser._id,
    tariffId: tariff._id,
  })
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error || "Не удалось выбрать тариф" },
      { status: 400 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        tariffId: String(tariff._id),
        companyId: context.tenantId,
        requiresPayment: false,
      },
    },
    { status: 200 }
  )
}

export const dynamic = "force-dynamic"
