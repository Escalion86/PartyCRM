import crypto from "crypto"
import { getPartyCompanyModel, getPartyPaymentModel } from "./partyModels"
import {
  SBP_BONUS_RATE,
  getSbpBonusAmount,
} from "./billingConfig"
import {
  TOCHKA_WEBHOOK_JWK,
  extractTochkaPayment,
  getTochkaPayment,
  normalizeAmount,
} from "./tochka"

const base64UrlDecode = (value) =>
  Buffer.from(
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
    "base64"
  )

const decodeJwtPart = (value) => {
  const text = base64UrlDecode(value).toString("utf8")
  return JSON.parse(text)
}

const getWebhookPublicKey = () => {
  const envJwk = String(process.env.TOCHKA_WEBHOOK_PUBLIC_JWK || "").trim()
  if (envJwk) return crypto.createPublicKey({ key: JSON.parse(envJwk), format: "jwk" })
  return crypto.createPublicKey({ key: TOCHKA_WEBHOOK_JWK, format: "jwk" })
}

const verifyPartyTochkaWebhookJwt = (jwt) => {
  const parts = String(jwt || "").trim().split(".")
  if (parts.length !== 3) throw new Error("invalid_jwt")

  const header = decodeJwtPart(parts[0])
  if (header?.alg !== "RS256") throw new Error("unsupported_jwt_alg")

  const signingInput = `${parts[0]}.${parts[1]}`
  const signature = base64UrlDecode(parts[2])
  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    getWebhookPublicKey(),
    signature
  )
  if (!verified) throw new Error("invalid_jwt_signature")

  return decodeJwtPart(parts[1])
}

const getPaymentMethodInfo = (providerPayment) => {
  const paymentType = String(
    providerPayment?.paymentType || providerPayment?.payment_type || ""
  ).trim()
  if (paymentType === "sbp") return { type: "sbp", title: "СБП", details: {} }
  if (paymentType === "card") {
    return { type: "card", title: "Банковская карта", details: {} }
  }
  return { type: paymentType, title: paymentType, details: {} }
}

const getProviderAmount = (providerPayment) => {
  const value =
    providerPayment?.amount?.value ??
    providerPayment?.amount ??
    providerPayment?.operationAmount
  return normalizeAmount(value)
}

const processSucceededPartyTochkaPayment = async ({
  payment,
  providerPayment,
}) => {
  if (payment.status === "succeeded") {
    return { ok: true, alreadyProcessed: true }
  }

  const expected = normalizeAmount(payment.amount)
  const received = getProviderAmount(providerPayment)
  if (expected !== received) {
    payment.status = "failed"
    payment.rawProviderStatus = providerPayment?.status || ""
    payment.comment = `${
      payment.comment || "Платеж"
    }: сумма платежа не совпала`
    await payment.save()
    return { ok: false, error: "amount_mismatch" }
  }

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(payment.tenantId)
  if (!company) {
    payment.status = "failed"
    payment.rawProviderStatus = providerPayment?.status || ""
    payment.comment = `${
      payment.comment || "Платеж"
    }: компания не найдена`
    await payment.save()
    return { ok: false, error: "company_not_found" }
  }

  const PartyPayments = await getPartyPaymentModel()
  const lockedPayment = await PartyPayments.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    {
      $set: {
        status: "succeeded",
        rawProviderStatus: providerPayment?.status || "",
      },
    },
    { new: true }
  )
  if (!lockedPayment) {
    const freshPayment = await PartyPayments.findById(payment._id).lean()
    if (freshPayment?.status === "succeeded") {
      return { ok: true, alreadyProcessed: true }
    }
    return {
      ok: false,
      error: "payment_not_pending",
      status: freshPayment?.status || "",
    }
  }
  payment = lockedPayment

  const methodInfo = getPaymentMethodInfo(providerPayment)
  const bonusAmount =
    payment.purpose === "balance" && methodInfo.type === "sbp"
      ? getSbpBonusAmount(payment.amount)
      : 0

  company.balance =
    Number(company.balance ?? 0) + Number(payment.amount ?? 0) + bonusAmount
  await company.save()

  payment.rawProviderStatus = providerPayment?.status || ""
  payment.paymentMethodType = methodInfo.type
  payment.paymentMethodTitle = methodInfo.title
  payment.paymentMethodDetails = methodInfo.details
  payment.paidAt = providerPayment?.date
    ? new Date(providerPayment.date)
    : new Date()
  await payment.save()

  if (bonusAmount > 0) {
    await PartyPayments.create({
      userId: payment.userId,
      tenantId: payment.tenantId,
      tariffId: null,
      amount: bonusAmount,
      type: "topup",
      source: "system",
      status: "succeeded",
      purpose: "balance",
      comment: `Бонус 2% за оплату через СБП по платежу ${payment.providerPaymentId}`,
      paymentMethodType: methodInfo.type,
      paymentMethodTitle: methodInfo.title,
    })
  }

  return { ok: true, bonusAmount }
}

const syncPartyTochkaPayment = async ({
  providerPaymentId,
  paymentId,
  providerPayment,
}) => {
  const PartyPayments = await getPartyPaymentModel()
  const query = { provider: "tochka" }
  if (providerPaymentId) query.providerPaymentId = providerPaymentId
  else if (paymentId) query._id = paymentId
  else return { ok: false, error: "payment_id_required" }

  const payment = await PartyPayments.findOne(query)
  if (!payment) return { ok: false, error: "payment_not_found" }
  if (!payment.providerPaymentId) {
    return { ok: false, error: "provider_payment_id_missing" }
  }

  const paymentInfo =
    providerPayment ||
    extractTochkaPayment(await getTochkaPayment(payment.providerPaymentId))
  payment.rawProviderStatus = paymentInfo?.status || ""

  if (paymentInfo?.status === "APPROVED") {
    return processSucceededPartyTochkaPayment({
      payment,
      providerPayment: paymentInfo,
    })
  }

  if (["EXPIRED", "REFUNDED"].includes(paymentInfo?.status)) {
    if (payment.status === "pending") {
      payment.status = "canceled"
      await payment.save()
    }
    return { ok: true, status: "canceled" }
  }

  await payment.save()
  return { ok: true, status: paymentInfo?.status || payment.status }
}

export {
  SBP_BONUS_RATE,
  getSbpBonusAmount,
  processSucceededPartyTochkaPayment,
  syncPartyTochkaPayment,
  verifyPartyTochkaWebhookJwt,
}
