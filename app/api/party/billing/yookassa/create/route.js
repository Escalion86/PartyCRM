import { NextResponse } from "next/server"
import crypto from "crypto"
import { getPartyRequestContext } from "@server/partyApi"
import { getPartyPaymentModel } from "@server/partyModels"
import { buildPartyBalanceTopUpPaymentDraft } from "@server/partyBillingProviderCheckoutCore"
import {
  createYookassaPayment,
  isYookassaConfigured,
  normalizeAmount,
} from "@server/yookassa"

const resolveReturnUrl = (req) => {
  const url = new URL(req.url)
  const domain = process.env.DOMAIN || "partycrm.ru"
  const origin = domain.startsWith("http")
    ? domain
    : `https://${domain.replace(/\/$/, "")}`
  return `${origin}/company/finance?payment=yookassa`
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  if (!isYookassaConfigured()) {
    return NextResponse.json(
      { success: false, error: "ЮKassa не настроена" },
      { status: 503 }
    )
  }

  const PartyPayments = await getPartyPaymentModel()
  const company = context.company
  const user = context.sessionUser

  const draft = buildPartyBalanceTopUpPaymentDraft(body)
  if (!draft.ok) {
    return NextResponse.json(
      { success: false, error: draft.error },
      { status: draft.status }
    )
  }
  const { amount, description, purpose } = draft

  const idempotenceKey = crypto.randomUUID()
  const payment = await PartyPayments.create({
    userId: user._id,
    tenantId: company._id,
    tariffId: null,
    amount,
    type: "topup",
    source: "yookassa",
    status: "pending",
    purpose,
    provider: "yookassa",
    idempotenceKey,
    comment: description,
  })

  try {
    const yookassaPayment = await createYookassaPayment({
      amount,
      description,
      idempotenceKey,
      returnUrl: resolveReturnUrl(req),
      user,
      metadata: {
        paymentId: String(payment._id),
        userId: String(user._id),
        tenantId: String(company._id),
        companyId: String(company._id),
        purpose,
        tariffId: "",
        partycrm: "true",
      },
    })

    payment.providerPaymentId = yookassaPayment.id || ""
    payment.rawProviderStatus = yookassaPayment.status || ""
    await payment.save()

    return NextResponse.json(
      {
        success: true,
        data: {
          paymentId: String(payment._id),
          providerPaymentId: yookassaPayment.id,
          status: yookassaPayment.status,
          amount: normalizeAmount(amount),
          confirmationUrl:
            yookassaPayment?.confirmation?.confirmation_url || "",
        },
      },
      { status: 201 }
    )
  } catch (error) {
    payment.status = "failed"
    payment.rawProviderStatus = "create_failed"
    payment.comment = `${
      description
    }. Ошибка создания платежа: ${error?.message || "ЮKassa"}`
    await payment.save()
    return NextResponse.json(
      { success: false, error: error?.message || "Не удалось создать платеж" },
      { status: 502 }
    )
  }
}
