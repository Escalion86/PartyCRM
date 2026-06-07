import { NextResponse } from "next/server"
import crypto from "crypto"
import { getPartyRequestContext } from "@server/partyApi"
import { getPartyPaymentModel, getPartyTariffModel } from "@server/partyModels"
import {
  createYookassaPayment,
  isYookassaConfigured,
  normalizeAmount,
} from "@server/yookassa"

const MIN_TOPUP_AMOUNT = 100
const MAX_TOPUP_AMOUNT = 300000

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

  const purpose = body?.purpose === "tariff" ? "tariff" : "balance"
  let tariff = null
  let amount = Number(body?.amount ?? 0)
  let description = "Пополнение баланса PartyCRM"

  if (purpose === "tariff") {
    const PartyTariffs = await getPartyTariffModel()
    tariff = await PartyTariffs.findById(body?.tariffId).lean()
    if (!tariff || tariff.hidden) {
      return NextResponse.json(
        { success: false, error: "Тариф не найден" },
        { status: 404 }
      )
    }
    amount = Number(tariff.price ?? 0)
    description = `Оплата тарифа ${tariff.title}`
  }

  if (
    !Number.isFinite(amount) ||
    amount < MIN_TOPUP_AMOUNT ||
    amount > MAX_TOPUP_AMOUNT
  ) {
    return NextResponse.json(
      {
        success: false,
        error: `Сумма должна быть от ${MIN_TOPUP_AMOUNT} до ${MAX_TOPUP_AMOUNT} руб.`,
      },
      { status: 400 }
    )
  }

  const idempotenceKey = crypto.randomUUID()
  const payment = await PartyPayments.create({
    userId: user._id,
    tenantId: company._id,
    tariffId: tariff?._id ?? null,
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
        tariffId: tariff?._id ? String(tariff._id) : "",
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
