import { NextResponse } from "next/server"
import { getPartyRequestContext } from "@server/partyApi"
import { getPartyPaymentModel } from "@server/partyModels"

export const GET = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 100)
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10)

  const PartyPayments = await getPartyPaymentModel()
  const payments = await PartyPayments.find({ tenantId: context.tenantId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean()

  return NextResponse.json({ success: true, data: payments }, { status: 200 })
}

export const dynamic = "force-dynamic"
