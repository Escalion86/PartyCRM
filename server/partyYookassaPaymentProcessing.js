import { getPartyCompanyModel, getPartyPaymentModel } from "./partyModels"
import {
  SBP_BONUS_RATE,
  getSbpBonusAmount,
} from "./billingConfig"
import { getYookassaPayment, normalizeAmount } from "./yookassa"

const getPaymentMethodInfo = (providerPayment) => {
  const method = providerPayment?.payment_method || {}
  const type = String(method?.type || "").trim()
  if (type === "bank_card") {
    const card = method?.card || {}
    const cardType = String(card?.card_type || "").trim()
    const last4 = String(card?.last4 || "").trim()
    return {
      type,
      title: [cardType || "Банковская карта", last4 ? `**** ${last4}` : ""]
        .filter(Boolean)
        .join(" "),
      details: {
        first6: card?.first6 || "",
        last4,
        cardType,
        issuerCountry: card?.issuer_country || "",
      },
    }
  }
  if (type === "sbp") {
    return {
      type,
      title: "СБП",
      details: {},
    }
  }
  return {
    type,
    title: type || "",
    details: {},
  }
}

const processSucceededPartyYookassaPayment = async ({
  payment,
  providerPayment,
}) => {
  if (payment.status === "succeeded") {
    return { ok: true, alreadyProcessed: true }
  }

  const expected = normalizeAmount(payment.amount)
  const received = String(providerPayment?.amount?.value || "")
  if (expected !== received || providerPayment?.amount?.currency !== "RUB") {
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
  payment.paidAt = providerPayment?.captured_at
    ? new Date(providerPayment.captured_at)
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

const syncPartyYookassaPayment = async ({
  providerPaymentId,
  paymentId,
}) => {
  const PartyPayments = await getPartyPaymentModel()
  const query = {
    provider: "yookassa",
  }
  if (providerPaymentId) query.providerPaymentId = providerPaymentId
  else if (paymentId) query._id = paymentId
  else return { ok: false, error: "payment_id_required" }

  const payment = await PartyPayments.findOne(query)
  if (!payment) return { ok: false, error: "payment_not_found" }
  if (!payment.providerPaymentId) {
    return { ok: false, error: "provider_payment_id_missing" }
  }

  const providerPayment = await getYookassaPayment(payment.providerPaymentId)
  payment.rawProviderStatus = providerPayment?.status || ""

  if (providerPayment?.status === "succeeded" && providerPayment?.paid === true) {
    return processSucceededPartyYookassaPayment({ payment, providerPayment })
  }

  if (providerPayment?.status === "canceled") {
    if (payment.status === "pending") {
      payment.status = "canceled"
      await payment.save()
    }
    return { ok: true, status: "canceled" }
  }

  await payment.save()
  return { ok: true, status: providerPayment?.status || payment.status }
}

export {
  processSucceededPartyYookassaPayment,
  syncPartyYookassaPayment,
}
