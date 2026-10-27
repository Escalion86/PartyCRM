import { NextResponse } from 'next/server'
import { getPartySessionUser } from '@server/partyAuth'
import { runPartyTaskScheduler } from '@server/partyTaskScheduler'

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

  try {
    const result = await runPartyTaskScheduler()
    return NextResponse.json({ success: true, data: result })
  } catch {
    return NextResponse.json({ success: false, error: { code: 'partycrm_task_scheduler_failed', message: 'Не удалось обработать задачи. Повторите запуск.' } }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
