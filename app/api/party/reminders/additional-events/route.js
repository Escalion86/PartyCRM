import { NextResponse } from 'next/server'
import PushReminderLogs from '@models/PushReminderLogs'
import { getPartySessionUser } from '@server/partyAuth'
import { getPartyCompanyModel, getPartyOrderModel } from '@server/partyModels'
import { sendPushToTenant } from '@server/pushNotifications'
import { runPartyAdditionalEventReminderBatch } from '@server/partyReminderCore'

const canRun = async (req) => {
  const secret = process.env.PARTYCRM_CRON_SECRET || process.env.BILLING_CRON_SECRET || ''
  const headerToken = req.headers.get('x-cron-secret') || ''
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token') || ''

  if (secret && (headerToken === secret || queryToken === secret)) {
    return { ok: true, user: null }
  }

  const user = await getPartySessionUser()
  if (user && ['support', 'admin'].includes(user.role)) {
    return { ok: true, user }
  }

  return { ok: false }
}

export async function POST(req) {
  const access = await canRun(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: { code: 'party_reminders_forbidden', message: 'Нет доступа' } },
      { status: 403 }
    )
  }

  const PartyCompanies = await getPartyCompanyModel()
  const PartyOrders = await getPartyOrderModel()

  const result = await runPartyAdditionalEventReminderBatch({
    dependencies: {
      findCompanies: () =>
        PartyCompanies.find({
          status: 'active',
          'settings.notifications.pushEnabled': true,
        })
          .select({ _id: 1, title: 1, settings: 1 })
          .lean(),
      findOrders: ({ companyId, dateToExclusive }) =>
        PartyOrders.find({
          tenantId: companyId,
          status: { $nin: ['canceled', 'closed'] },
          additionalEvents: {
            $elemMatch: {
              done: { $ne: true },
              date: { $lt: dateToExclusive },
            },
          },
        })
          .select({ _id: 1, title: 1, status: 1, additionalEvents: 1 })
          .lean(),
      createReminderLog: (entry) =>
        PushReminderLogs.create({
          tenantId: entry.tenantId,
          orderId: entry.orderId,
          additionalEventId: entry.additionalEventId,
          additionalEventIndex: entry.additionalEventIndex,
          reminderType: entry.reminderType,
          dateKey: entry.dateKey,
        }),
      sendPush: ({ tenantId, companyId, payload }) =>
        sendPushToTenant({
          tenantId,
          product: 'partycrm',
          companyId,
          source: 'party-additional-events-reminder',
          payload,
        }),
    },
  })

  return NextResponse.json({ success: true, data: result })
}

export const dynamic = 'force-dynamic'
