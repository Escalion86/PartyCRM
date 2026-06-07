import { NextResponse } from "next/server"
import crypto from "crypto"
import { getPartyRequestContext } from "@server/partyApi"
import {
  getPartyPaymentModel,
  getPartyTariffModel,
} from "@server/partyModels"
import {
  createTochkaPayment,
  getTochkaOperationId,
  getTochkaPaymentUrl,
  isTochkaConfigured,
  normalizeAmount,
} from "@server/tochka"

const MIN_TOPUP_AMOUNT = 100
const MAX_TOPUP_AMOUNT = 300000

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
        tariffId: tariff?._id ? String(tariff._id) : "",
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
