import { NextResponse } from "next/server"
import {
  SBP_BONUS_RATE,
  isSbpBonusEnabled,
} from "@server/billingConfig"
import { isTochkaConfigured } from "@server/tochka"
import { isYookassaConfigured } from "@server/yookassa"

export const GET = async () =>
  NextResponse.json(
    {
      success: true,
      data: {
        sbpBonusEnabled: isSbpBonusEnabled(),
        sbpBonusRate: SBP_BONUS_RATE,
        providers: {
          yookassa: isYookassaConfigured(),
          tochka: isTochkaConfigured(),
        },
        defaultProvider: isYookassaConfigured()
          ? "yookassa"
          : isTochkaConfigured()
            ? "tochka"
            : "",
      },
    },
    { status: 200 }
  )

export const dynamic = "force-dynamic"
