import { NextResponse } from "next/server"
import crypto from "crypto"
import { getPartyRequestContext } from "@server/partyApi"
import { getPartyPaymentModel } from "@server/partyModels"
import { buildPartyBalanceTopUpPaymentDraft } from "@server/partyBillingProviderCheckoutCore"
import {
  createTochkaPayment,
  getTochkaOperationId,
  getTochkaPaymentUrl,
  isTochkaConfigured,
  normalizeAmount,
} from "@server/tochka"

const resolveReturnUrl = () => {
  const domain = process.env.DOMAIN || "partycrm.ru"
  const origin = domain.startsWith("http")
    ? domain
    : `https://${domain.replace(/\/$/, "")}`
  return `${origin.replace(/\/$/, "")}/company/finance?payment=tochka`
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  if (!isTochkaConfigured()) {
    return NextResponse.json(
      { success: false, error: "Точка не настроена" },
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
    source: "tochka",
    status: "pending",
    purpose,
    provider: "tochka",
    idempotenceKey,
    comment: description,
  })

  try {
    const tochkaPayment = await createTochkaPayment({
      amount,
      description,
      idempotenceKey,
      returnUrl: resolveReturnUrl(),
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

    const operationId = getTochkaOperationId(tochkaPayment)
    const confirmationUrl = getTochkaPaymentUrl(tochkaPayment)
    payment.providerPaymentId = operationId
    payment.rawProviderStatus = "CREATED"
    await payment.save()

    if (!operationId || !confirmationUrl) {
      throw new Error("Точка не вернула ссылку на оплату")
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          paymentId: String(payment._id),
          providerPaymentId: operationId,
          status: "CREATED",
          amount: normalizeAmount(amount),
          confirmationUrl,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("PartyCRM Tochka payment create failed", {
      paymentId: String(payment._id),
      userId: String(user._id),
      amount,
      purpose,
      message: error?.message || "Точка",
    })
    payment.status = "failed"
    payment.rawProviderStatus = "create_failed"
    payment.comment = `${
      description
    }. Ошибка создания платежа: ${error?.message || "Точка"}`
    await payment.save()
    return NextResponse.json(
      { success: false, error: error?.message || "Не удалось создать платеж" },
      { status: 502 }
    )
  }
}
