import { NextResponse } from "next/server"
import { getPartyPaymentModel } from "@server/partyModels"
import {
  syncPartyTochkaPayment,
  verifyPartyTochkaWebhookJwt,
} from "@server/partyTochkaPaymentProcessing"

const extractWebhookPayment = (payload) =>
  payload?.Data?.Payment ||
  payload?.Data?.Operation ||
  payload?.Data ||
  payload?.Payment ||
  payload?.Operation ||
  payload ||
  {}

export const POST = async (req) => {
  const token = await req.text().catch(() => "")
  if (!token) {
    return NextResponse.json({ success: false }, { status: 400 })
  }

  let payload = null
  try {
    payload = verifyPartyTochkaWebhookJwt(token)
  } catch {
    return NextResponse.json({ success: false }, { status: 403 })
  }

  const webhookType = String(
    payload?.webhookType || payload?.type || payload?.event || ""
  ).trim()
  if (webhookType && webhookType !== "acquiringInternetPayment") {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  const providerPayment = extractWebhookPayment(payload)
  const providerPaymentId = String(
    providerPayment?.operationId ||
      providerPayment?.id ||
      payload?.operationId ||
      payload?.paymentId ||
      ""
  ).trim()
  if (!providerPaymentId) {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  const PartyPayments = await getPartyPaymentModel()
  const partyPayment = await PartyPayments.findOne({
    provider: "tochka",
    providerPaymentId,
  })

  if (!partyPayment) {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  const result = await syncPartyTochkaPayment({
    providerPaymentId,
    providerPayment,
  })
  return NextResponse.json({ success: true, data: result }, { status: 200 })
}
