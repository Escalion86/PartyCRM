import { NextResponse } from "next/server"
import { getPartyRequestContext } from "@server/partyApi"
import getPartyCompanyTariffAccessState from "@server/getPartyCompanyTariffAccess"

export const GET = async (req) => {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const company = context.company
  const { serializedAccess } = await getPartyCompanyTariffAccessState(company)

  return NextResponse.json(
    {
      success: true,
      data: {
        companyId: context.tenantId,
        balance: company?.balance ?? 0,
        tariffId: company?.tariffId ? String(company.tariffId) : null,
        billingStatus: company?.billingStatus ?? "active",
        tariffActiveUntil: company?.tariffActiveUntil ?? null,
        nextChargeAt: company?.nextChargeAt ?? null,
        trialActivatedAt: company?.trialActivatedAt ?? null,
        trialEndsAt: company?.trialEndsAt ?? null,
        trialUsed: company?.trialUsed ?? false,
        access: serializedAccess,
      },
    },
    { status: 200 }
  )
}

export const dynamic = "force-dynamic"
