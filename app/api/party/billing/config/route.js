import { NextResponse } from "next/server"
import {
  SBP_BONUS_RATE,
  isSbpBonusEnabled,
} from "@server/billingConfig"

export const GET = async () =>
  NextResponse.json(
    {
      success: true,
      data: {
        sbpBonusEnabled: isSbpBonusEnabled(),
        sbpBonusRate: SBP_BONUS_RATE,
      },
    },
    { status: 200 }
  )

export const dynamic = "force-dynamic"
