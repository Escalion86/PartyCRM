import { NextResponse } from "next/server"
import { getPartySessionUser } from "@server/partyAuth"
import {
  getPartyCompanyModel,
  getPartyTariffModel,
  getPartyPaymentModel,
} from "@server/partyModels"

const addMonths = (date, count) => {
  const next = new Date(date)
  const day = next.getDate()
  next.setMonth(next.getMonth() + count)
  if (next.getDate() < day) {
    next.setDate(0)
  }
  return next
}

const canRun = async (req) => {
  const secret = process.env.BILLING_CRON_SECRET || ""
  const headerToken = req.headers.get("x-cron-secret") || ""
  const url = new URL(req.url)
  const queryToken = url.searchParams.get("token") || ""

  if (secret && (headerToken === secret || queryToken === secret)) {
    return { ok: true, user: null }
  }

  const user = await getPartySessionUser()
  if (user && ["support", "admin"].includes(user.role)) {
    return { ok: true, user }
  }

  return { ok: false }
}

export const POST = async (req) => {
  const access = await canRun(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: "Нет доступа" },
      { status: 403 }
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const PartyTariffs = await getPartyTariffModel()
  const PartyPayments = await getPartyPaymentModel()

  const now = new Date()
  const dueCompanies = await PartyCompanies.find({
    tariffId: { $ne: null },
    nextChargeAt: { $lte: now },
    billingStatus: { $ne: "cancelled" },
  }).lean()

  const tariffs = await PartyTariffs.find({
    hidden: { $ne: true },
  }).lean()
  const freeTariff =
    tariffs.find((item) => Number(item?.price ?? 0) <= 0) ?? null

  let processed = 0
  let renewed = 0
  let movedToFree = 0
  let skipped = 0

  for (const company of dueCompanies) {
    processed += 1
    if (!company?.tariffId) {
      skipped += 1
      continue
    }
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(company.tariffId)
    )
    if (!tariff) {
      skipped += 1
      continue
    }
    const price = Number(tariff.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) {
      await PartyCompanies.findByIdAndUpdate(company._id, {
        tariffActiveUntil: null,
        nextChargeAt: null,
        billingStatus: "active",
      })
      skipped += 1
      continue
    }

    const balance = Number(company.balance ?? 0)
    if (!Number.isFinite(balance) || balance < price) {
      if (freeTariff) {
        await PartyCompanies.findByIdAndUpdate(company._id, {
          tariffId: freeTariff._id,
          tariffActiveUntil: null,
          nextChargeAt: null,
          billingStatus: "debt",
        })
        movedToFree += 1
      } else {
        await PartyCompanies.findByIdAndUpdate(company._id, {
          billingStatus: "debt",
        })
      }
      continue
    }

    const baseDate =
      company.tariffActiveUntil && new Date(company.tariffActiveUntil) > now
        ? new Date(company.tariffActiveUntil)
        : now
    const nextChargeAt = addMonths(baseDate, 1)

    await PartyCompanies.findByIdAndUpdate(company._id, {
      balance: balance - price,
      tariffActiveUntil: nextChargeAt,
      nextChargeAt,
      billingStatus: "active",
    })

    await PartyPayments.create({
      userId: null,
      tenantId: company._id,
      tariffId: tariff._id,
      amount: price,
      type: "charge",
      source: "system",
      comment: `Продление тарифа "${tariff.title}"`,
    })

    renewed += 1
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        processed,
        renewed,
        movedToFree,
        skipped,
      },
    },
    { status: 200 }
  )
}

export const dynamic = "force-dynamic"
