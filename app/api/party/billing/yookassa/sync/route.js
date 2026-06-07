import { NextResponse } from "next/server"
import { getPartyRequestContext } from "@server/partyApi"
import { getPartyPaymentModel } from "@server/partyModels"
import { syncPartyYookassaPayment } from "@server/partyYookassaPaymentProcessing"

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const paymentId = String(body?.paymentId || "").trim()
  if (!paymentId) {
    return NextResponse.json(
      { success: false, error: "Не указан платеж" },
      { status: 400 }
    )
  }

  const PartyPayments = await getPartyPaymentModel()
  const payment = await PartyPayments.findOne({
    _id: paymentId,
    provider: "yookassa",
  }).lean()
  if (!payment) {
    return NextResponse.json(
      { success: false, error: "Платеж не найден" },
      { status: 404 }
    )
  }

  const isPaymentCompany = String(payment.tenantId) === String(context.tenantId)
  const isAdmin = ["support", "admin"].includes(context.sessionUser?.role)
  if (!isAdmin && !isPaymentCompany) {
    return NextResponse.json(
      { success: false, error: "Нет доступа" },
      { status: 403 }
    )
  }

  const result = await syncPartyYookassaPayment({ paymentId })
  return NextResponse.json(
    { success: result.ok, data: result },
    { status: 200 }
  )
}

export const dynamic = "force-dynamic"
