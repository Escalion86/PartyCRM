import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Services from '@models/Services'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const clampCount = (value, max) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return 0
  return Math.min(Math.floor(num), max)
}

const randomItem = (list) =>
  list.length ? list[Math.floor(Math.random() * list.length)] : null

const randomFromRange = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const normalizeTownList = (settings) => {
  const towns = Array.isArray(settings?.towns) ? settings.towns : []
  const normalized = towns
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  if (settings?.defaultTown && !normalized.includes(settings.defaultTown)) {
    normalized.unshift(settings.defaultTown)
  }
  return normalized.length > 0 ? normalized : ['Красноярск', 'Новосибирск']
}

const buildPhone = (seed) => {
  const base = String(9000000000 + (seed % 999999999))
  return Number(base)
}

const names = [
  'Алексей',
  'Анна',
  'Иван',
  'Мария',
  'Павел',
  'Ольга',
  'Сергей',
  'Екатерина',
  'Артем',
  'Наталья',
]
const surnames = [
  'Иванов',
  'Петров',
  'Сидоров',
  'Кузнецова',
  'Смирнов',
  'Васильева',
  'Орлов',
  'Михайлова',
  'Ершов',
  'Фролова',
]
const streets = [
  'Ленина',
  'Мира',
  'Комсомольская',
  'Партизанская',
  'Советская',
  'Горького',
  'Калинина',
  'Октябрьская',
]

export const POST = async (req) => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Недостаточно прав' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const counts = {
    clients: clampCount(body?.clients, 200),
    services: clampCount(body?.services, 200),
    requests: clampCount(body?.requests, 200),
    events: clampCount(body?.events, 200),
    transactions: clampCount(body?.transactions, 500),
  }

  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId })
    .select('towns defaultTown custom')
    .lean()
  const towns = normalizeTownList(settings)
  const defaultDuration =
    Number(settings?.custom?.defaultEventDurationMinutes ?? 60) || 60

  const existingClients = await Clients.find({ tenantId }).lean()
  const existingServices = await Services.find({ tenantId }).lean()
  const existingEvents = await Events.find({ tenantId }).lean()

  const created = {
    clients: [],
    services: [],
    requests: [],
    events: [],
    transactions: [],
  }

  for (let i = 0; i < counts.clients; i += 1) {
    const firstName = randomItem(names)
    const secondName = randomItem(surnames)
    created.clients.push({
      tenantId,
      firstName,
      secondName,
      phone: buildPhone(Date.now() + i),
      clientType: 'none',
    })
  }
  if (created.clients.length > 0) {
    created.clients = await Clients.insertMany(created.clients)
  }

  for (let i = 0; i < counts.services; i += 1) {
    created.services.push({
      tenantId,
      title: `Услуга ${existingServices.length + i + 1}`,
      description: 'Описание услуги',
      duration: randomFromRange(30, 180),
    })
  }
  if (created.services.length > 0) {
    created.services = await Services.insertMany(created.services)
  }

  const clientPool = [...existingClients, ...created.clients]
  const servicePool = [...existingServices, ...created.services]

  for (let i = 0; i < counts.requests; i += 1) {
    const client = randomItem(clientPool)
    if (!client?._id) continue
    const town = randomItem(towns)
    const servicesIds = servicePool.length
      ? [randomItem(servicePool)._id]
      : []
    const daysOffset = randomFromRange(-10, 20)
    const start = new Date()
    start.setDate(start.getDate() + daysOffset)
    start.setHours(randomFromRange(9, 21), randomFromRange(0, 59), 0, 0)

    created.requests.push({
      tenantId,
      clientId: client._id,
      eventDate: start,
      address: {
        town,
        street: randomItem(streets),
        house: String(randomFromRange(1, 120)),
        comment: 'Тестовая локация',
      },
      contractSum: randomFromRange(5000, 50000),
      description: 'Тестовая заявка',
      servicesIds,
      otherContacts: [],
      status: 'draft',
    })
  }
  if (created.requests.length > 0) {
    created.requests = await Events.insertMany(created.requests)
  }

  for (let i = 0; i < counts.events; i += 1) {
    const client = randomItem(clientPool)
    if (!client?._id) continue
    const town = randomItem(towns)
    const servicesIds = servicePool.length
      ? [randomItem(servicePool)._id]
      : []
    const daysOffset = randomFromRange(-5, 30)
    const start = new Date()
    start.setDate(start.getDate() + daysOffset)
    start.setHours(randomFromRange(10, 22), randomFromRange(0, 59), 0, 0)
    const end = new Date(
      start.getTime() + defaultDuration * 60 * 1000
    )

    created.events.push({
      tenantId,
      clientId: client._id,
      eventDate: start,
      dateEnd: end,
      address: {
        town,
        street: randomItem(streets),
        house: String(randomFromRange(1, 120)),
        comment: 'Тестовый адрес',
      },
      contractSum: randomFromRange(8000, 80000),
      status: 'active',
      calendarImportChecked: true,
      servicesIds,
      description: 'Тестовое мероприятие',
      otherContacts: [],
    })
  }
  if (created.events.length > 0) {
    created.events = await Events.insertMany(created.events)
  }

  const eventPool = [...existingEvents, ...created.events].filter(
    (event) => event?.status !== 'draft'
  )
  for (let i = 0; i < counts.transactions; i += 1) {
    const event = randomItem(eventPool)
    if (!event?._id) continue
    const type = Math.random() > 0.3 ? 'income' : 'expense'
    const amount =
      type === 'income'
        ? randomFromRange(3000, 40000)
        : randomFromRange(500, 15000)
    created.transactions.push({
      tenantId,
      eventId: event._id,
      clientId: event.clientId,
      amount,
      type,
      category: type === 'income' ? 'final_payment' : 'other',
      date: event.eventDate ?? new Date(),
      comment: 'Тестовая транзакция',
    })
  }
  if (created.transactions.length > 0) {
    created.transactions = await Transactions.insertMany(created.transactions)
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        clients: created.clients.length,
        services: created.services.length,
        requests: created.requests.length,
        events: created.events.length,
        transactions: created.transactions.length,
      },
    },
    { status: 200 }
  )
}
