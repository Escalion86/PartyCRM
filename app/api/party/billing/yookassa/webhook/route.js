import { NextResponse } from "next/server"
import { getPartyPaymentModel } from "@server/partyModels"
import { syncPartyYookassaPayment } from "@server/partyYookassaPaymentProcessing"
import dbConnect from "@server/dbConnect"

export const POST = async (req) => {
  const secret = String(
    process.env.YOOKASSA_WEBHOOK_SECRET || ""
  ).trim()
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false }, { status: 503 })
  }

  if (secret) {
    const url = new URL(req.url)
    const token =
      url.searchParams.get("token") ||
      req.headers.get("x-webhook-token")
    if (token !== secret) {
      return NextResponse.json({ success: false }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))

  // YooKassa sends notification_event for payments
  const providerPaymentId =
    String(body?.object?.id || body?.payment?.id || "").trim()

  if (!providerPaymentId) {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  await dbConnect()

  // Check if payment exists in PartyCRM
  const PartyPayments = await getPartyPaymentModel()
  const partyPayment = await PartyPayments.findOne({
    provider: "yookassa",
    providerPaymentId,
  })

  if (partyPayment) {
    const result = await syncPartyYookassaPayment({
      providerPaymentId,
    })
    return NextResponse.json({ success: true, data: result }, { status: 200 })
  }

  // Payment not found in PartyCRM — might be ArtistCRM payment, ignore
  return NextResponse.json({ success: true }, { status: 200 })
}
