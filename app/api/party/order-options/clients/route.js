import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import { getPartyClientModel } from '@server/partyModels'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { normalizePhoneNumber } from '@helpers/phoneInput'

export const dynamic = 'force-dynamic'
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
    return NextResponse.json({ success: true, data: {
      _id: String(person._id), name: can('orders.client.name') ? [person.firstName, person.secondName, person.thirdName].filter(Boolean).join(' ') : 'Контакт',
      ...(can('orders.client.name') ? { nameParts: { firstName: person.firstName || '', secondName: person.secondName || '', thirdName: person.thirdName || '' } } : {}),
      ...(can('orders.client.phone') ? { phone: person.phone } : {}), ...(can('orders.client.email') ? { email: person.email } : {}),
    } }, { status: 201 })
  } catch { return partyError(500, 'partycrm_client_create_failed', 'Не удалось создать клиента') }
}
