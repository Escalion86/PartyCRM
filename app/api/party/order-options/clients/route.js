import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { getPartyClientModel } from '@server/partyModels'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { normalizePhoneNumber } from '@helpers/phoneInput'

export const dynamic = 'force-dynamic'

const clientFields = (can) => ({
  name: can('orders.client.name'),
  phone: can('orders.client.phone'),
  email: can('orders.client.email'),
})

const clientOption = (person, fields) => ({
  _id: String(person._id),
  name: fields.name ? [person.firstName, person.secondName, person.thirdName].filter(Boolean).join(' ') : 'Контакт',
  ...(fields.name ? { nameParts: { firstName: person.firstName || '', secondName: person.secondName || '', thirdName: person.thirdName || '' } } : {}),
  ...(fields.phone ? { phone: person.phone } : {}),
  ...(fields.email ? { email: person.email } : {}),
})

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const clientSearchFilter = (query, fields) => {
  const matches = []
  if (fields.name) {
    const regex = query.split(/\s+/u).map(escapeRegex).join('\\s+')
    for (const [first, second] of [['$firstName', '$secondName'], ['$secondName', '$firstName']]) {
      matches.push({ $expr: { $regexMatch: {
        input: { $concat: [
          { $ifNull: [first, ''] }, ' ',
          { $ifNull: [second, ''] }, ' ',
          { $ifNull: ['$thirdName', ''] },
        ] },
        regex,
        options: 'i',
      } } })
    }
  }
  if (fields.phone && /^[\d+()\s.\-‐‑‒–—]+$/u.test(query)) {
    const normalized = normalizePhoneNumber(query)
    const digits = query.replace(/\D/g, '')
    if (digits) matches.push({ $expr: { $regexMatch: {
      input: { $convert: { input: '$phone', to: 'string', onError: '', onNull: '' } },
      regex: [...(normalized ? normalized.slice(1) : digits)].join('[^0-9]*'),
    } } })
  }
  if (fields.email) matches.push({ email: { $regex: escapeRegex(query), $options: 'i' } })
  return matches
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  const can = (resource, action = 'read') => canPartyAccess(context, { resource, action })
  const fields = clientFields(can)
  if ((!can('orders', 'create') && !can('orders', 'edit')) || !can('orders.clientId', 'edit') || !Object.values(fields).some(Boolean)) {
    return partyError(403, 'partycrm_client_search_forbidden', 'Нет права искать клиентов для заказа')
  }

  const params = req.nextUrl?.searchParams || new URL(req.url).searchParams
  const query = params.get('q')?.trim() || ''
  if (query.length > 120 || /[\u0000-\u001f\u007f]/u.test(query)) {
    return partyError(400, 'partycrm_invalid_client_query', 'Введите до 120 символов в поле поиска')
  }

  try {
    const matches = query ? clientSearchFilter(query, fields) : []
    const headers = { 'Cache-Control': 'private, no-store' }
    if (query && !matches.length) return NextResponse.json({ success: true, data: [] }, { headers })

    const Clients = await getPartyClientModel()
    const clients = await Clients.find({
      tenantId: context.tenantId,
      status: { $ne: 'archived' },
      ...(matches.length ? { $or: matches } : {}),
    })
      .select(['_id', fields.name && 'firstName secondName thirdName', fields.phone && 'phone', fields.email && 'email'].filter(Boolean).join(' '))
      .sort(fields.name ? { firstName: 1, secondName: 1, thirdName: 1, _id: 1 } : { _id: 1 })
      .limit(40)
      .lean()
    return NextResponse.json({ success: true, data: clients.map((person) => clientOption(person, fields)) }, { headers })
  } catch {
    return partyError(500, 'partycrm_client_search_failed', 'Не удалось найти клиентов')
  }
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  const can = (resource, action = 'read') => canPartyAccess(context, { resource, action })
  if (!can('orders', 'create') || !can('orders.clientId', 'edit') || !can('clients.create', 'edit')) return partyError(403, 'partycrm_client_create_forbidden', 'Нет права создавать клиента для заказа')
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['firstName', 'secondName', 'thirdName', 'phone', 'email'].includes(key))) return partyError(400, 'partycrm_invalid_client', 'Проверьте поля нового клиента')
    const data = {}
    for (const [key, value] of Object.entries(body)) {
      const resource = ['firstName', 'secondName', 'thirdName'].includes(key) ? 'orders.client.name' : `orders.client.${key}`
      if (!can(resource, 'edit')) return partyError(403, 'partycrm_client_field_forbidden', 'Нет права вводить это поле клиента')
      if (key === 'phone') {
        const normalized = value ? normalizePhoneNumber(value) : null
        if (value && !normalized) return partyError(400, 'partycrm_invalid_phone', 'Укажите полный номер телефона')
        data.phone = normalized ? Number(normalized) : null
      } else {
        if (typeof value !== 'string' || value.trim().length > 120) return partyError(400, 'partycrm_invalid_client', 'Поле должно содержать не более 120 символов')
        data[key] = key === 'email' ? value.trim().toLowerCase() : value.trim()
        if (key === 'email' && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return partyError(400, 'partycrm_invalid_email', 'Проверьте email')
      }
    }
    if (![data.firstName, data.secondName, data.phone, data.email].some(Boolean)) return partyError(400, 'partycrm_empty_client', 'Укажите имя, телефон или email клиента')
    const Clients = await getPartyClientModel()
    if (data.phone && await Clients.exists({ tenantId: context.tenantId, phone: data.phone, status: { $ne: 'archived' } })) return partyError(409, 'partycrm_client_phone_exists', 'Клиент с таким телефоном уже есть в компании. Выберите его из списка.')
    const person = await Clients.create({ ...data, tenantId: context.tenantId })
    return NextResponse.json({ success: true, data: clientOption(person, clientFields(can)) }, { status: 201 })
  } catch { return partyError(500, 'partycrm_client_create_failed', 'Не удалось создать клиента') }
}
