import { NextResponse } from 'next/server'
import { getPartyTariffModel } from '@server/partyModels'

export async function POST(req) {
  const body = await req.json().catch(() => ({}))
  const secret = body.secret || req.headers.get('x-seed-secret')
  
  if (secret !== process.env.PARTYCRM_SECRET) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const PartyTariffs = await getPartyTariffModel()
  const existing = await PartyTariffs.find().lean()
  
  const tariffs = [
    { title: 'Базовый', subtitle: 'Для небольших агентств', price: 1490,
      description: 'Для небольших агентств и начинающих команд',
      features: ['До 3 сотрудников','До 50 заказов в месяц','Учёт клиентов','Базовые документы','Бронирование площадок'],
      hidden: false, eventsPerMonth: 50, allowCalendarSync: false, allowStatistics: false, allowDocuments: true, allowTelephony: false, allowAi: false },
    { title: 'Профи', subtitle: 'Для растущих агентств', price: 2990,
      description: 'Для растущих агентств с полноценным учётом',
      features: ['До 10 сотрудников','Безлимит заказов','Всё из Базового','Финансы','Google Календарь','Телефония','Отчётность по прибыли'],
      hidden: false, eventsPerMonth: 0, allowCalendarSync: true, allowStatistics: true, allowDocuments: true, allowTelephony: true, allowAi: false },
    { title: 'Бизнес', subtitle: 'Для крупных агентств', price: 5990,
      description: 'Для крупных агентств с индивидуальными задачами',
      features: ['Безлимит сотрудников','Всё из Профи','Кастомные интеграции','Отдельный менеджер','Приоритетная разработка','Индивидуальный онбординг'],
      hidden: false, eventsPerMonth: 0, allowCalendarSync: true, allowStatistics: true, allowDocuments: true, allowTelephony: true, allowAi: true },
  ]

  const created = []
  for (const t of tariffs) {
    const found = existing.find(e => e.title === t.title)
    if (!found) {
      await PartyTariffs.create(t)
      created.push(t.title)
    }
  }

  const all = await PartyTariffs.find().lean()
  return NextResponse.json({ success: true, created, all })
}
