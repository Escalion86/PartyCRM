import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'
import { isPartyCompanyModuleEnabled } from '../helpers/partyCompanyModules.js'
import { canOpenPartyOrderWizard, getPartyOrderWizardInitialStep } from '../helpers/partyOrderWizardStart.js'
import { PARTY_ORDER_WIZARD_STEP } from '../helpers/partyOrderWizardSteps.js'
import { redactPartyServiceConfigurationPrices } from '../helpers/partyServiceConfiguration.js'
import { redactPartyLocationRentalConfiguration } from '../helpers/partyMultiPlaceBooking.js'

const tenantId = 'a'.repeat(24), orderId = 'b'.repeat(24), staffId = 'c'.repeat(24), managerId = 'd'.repeat(24), clientId = 'e'.repeat(24)
const code = (await readFile(new URL('../app/api/party/order-options/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
function setup(grants = {}, patch = {}, brief = async () => ({ ok: true }), catalog = [], locationCatalog = []) {
  const context = { tenantId, role: 'performer', staff: { _id: 'f'.repeat(24), tenantId, status: 'active', role: 'performer', positionId: 'position' }, position: { active: true, permissions: { orders: 'read', 'orders.assignedStaff': 'read', 'orders.client.name': 'read', ...grants }, orderScope: { locationIds: ['own'] } }, company: { _id: tenantId, settings: {} } }
  const order = { _id: orderId, tenantId, locationId: 'own', status: 'active', clientId, assignedStaff: [{ staffId }], responsibleStaffId: managerId, ...patch }
  const filters = [], lookups = []
  let modelCalls = 0
  const q = (value) => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => value })
  const people = [{ _id: staffId, firstName: 'Архивный исполнитель', role: 'performer', status: 'archived', phone: '79990000000' }, { _id: managerId, firstName: 'Менеджер', role: 'performer', status: 'active', phone: '79990000001' }]
  const deps = {
    canPartyAccess, buildPartyOrderAccessFilter,
    isPartyCompanyModuleEnabled, canOpenPartyOrderWizard, getPartyOrderWizardInitialStep, PARTY_ORDER_WIZARD_STEP,
    redactPartyServiceConfigurationPrices,
    redactPartyLocationRentalConfiguration,
    getPartyOrderTypes: async () => [],
    validatePartyBriefForTransition: brief,
    isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(id), getPartyRequestContext: async () => ({ context }),
    partyError: (status, code) => ({ status, code }), NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyOrderModel: async () => { modelCalls++; return { findOne(filter) { lookups.push(filter); return q(order) }, find() { assert.fail('a contextual request must not use the first 120 orders') } } },
    getPartyStaffModel: async () => { modelCalls++; return { find(filter) { filters.push(filter); return q(people.filter((person) => !filter._id || filter._id.$in.includes(person._id))) } } },
    getPartyClientModel: async () => { modelCalls++; return { find(filter) {
      assert.equal(filter.tenantId, tenantId)
      if (grants['orders.clientId'] === 'edit') assert.equal(Object.hasOwn(filter, '_id'), false)
      else assert.deepEqual(filter._id.$in, order.clientId ? [order.clientId] : [])
      return q([{ _id: clientId, firstName: 'Заказчик', phone: 'private-phone', email: 'private-email' }])
    } } },
    getPartyServiceModel: async () => {
      modelCalls++
      return { find(filter) {
        assert.equal(filter.tenantId, tenantId)
        return {
          select(fields) {
            const projected = catalog.map((service) =>
              Object.fromEntries(Object.entries(service).filter(([key]) => fields.split(' ').includes(key)))
            )
            return q(projected)
          },
        }
      } }
    },
    getPartyLocationModel: async () => {
      modelCalls++
      return { find: () => ({ select(fields) {
        return q(locationCatalog.map((location) => Object.fromEntries(Object.entries(location).filter(([key]) => fields.split(' ').includes(key)))))
      } }) }
    },
  }
  const GET = new Function(...Object.keys(deps), `${code}\nreturn GET`)(...Object.values(deps))
  return { context, filters, lookups, models: () => modelCalls, request: (id = orderId) => GET({ url: `https://party.test/api/party/order-options?orderId=${id}` }) }
}

test('contextual catalogs resolve an order outside the default list and retain assigned archived names without phone access', async () => {
  const state = setup()
  const result = await state.request()
  assert.equal(result.status, 200)
  assert.deepEqual(state.lookups, [{ _id: orderId, tenantId }])
  assert.deepEqual(state.filters[0]._id.$in, [staffId])
  assert.equal(result.body.data.staff[0].status, 'archived')
  assert.equal(result.body.data.staff[0].name, 'Архивный исполнитель')
  assert.equal(Object.hasOwn(result.body.data.staff[0], 'phone'), false)
  assert.equal(JSON.stringify(result.body).includes('private-phone'), false)
  assert.equal(JSON.stringify(result.body).includes('private-email'), false)
})

test('a visible manager outside the assigned team is resolved only with the manager field grant', async () => {
  const state = setup({ 'orders.responsibleStaffId': 'read', 'staff.phone': 'read' })
  const result = await state.request()
  assert.deepEqual(state.filters[0]._id.$in, [staffId, managerId])
  assert.equal(result.body.data.staff.find((person) => person._id === managerId).phone, '79990000001')
})

test('manager-only access does not disclose the hidden team', async () => {
  const state = setup({ 'orders.assignedStaff': 'hidden', 'orders.responsibleStaffId': 'read' })
  const result = await state.request()
  assert.deepEqual(state.filters[0]._id.$in, [managerId])
  assert.deepEqual(result.body.data.staff.map((person) => person._id), [managerId])
})

test('booking staff receive location capacity and tariff input fields without the prices', async () => {
  const hourlyRate = { fields: [{ type: 'number', id: 'guests', title: 'Гости', unit: 'чел.', required: true, pricePerUnit: 321 }] }
  const locations = [{ title: 'Зал', capacity: 25, hourlyRentalRate: 1234, rentalConfiguration: { hourlyRate, extras: null } }]
  const grants = { 'orders.locationId': 'read' }
  const masked = await setup(grants, {}, undefined, [], locations).request()
  const [location] = masked.body.data.locations
  assert.equal(location.capacity, 25)
  assert.equal(location.rentalConfiguration.hourlyRate.fields[0].title, 'Гости')
  assert.doesNotMatch(JSON.stringify(location), /price|hourlyRentalRate|321|1234/i)
  const full = await setup({ ...grants, 'finance.clientAmount': 'read' }, {}, undefined, [], locations).request()
  assert.deepEqual(full.body.data.locations, locations)
})

test('service catalogs expose configurable durations without leaking prices to staff without finance access', async () => {
  const configuration = {
    participantTiers: [{ min: 1, max: 10, includedParticipants: 5, durationMinutes: 90, price: 2000, pricePerParticipant: 100, maxPrice: 2500 }],
    addons: [{ id: 'props', title: 'Реквизит', priceDelta: 300, durationDelta: 15 }],
    optionGroups: [{ id: 'format', title: 'Формат', required: true, options: [{ id: 'long', title: 'Длинный', priceDelta: 500, durationDelta: 30 }] }],
  }
  const catalog = [{ title: 'Игра', duration: 60, price: 1500, configuration }]
  const withoutPrice = await setup({ 'orders.servicesIds': 'read' }, {}, undefined, catalog).request()
  assert.deepEqual(withoutPrice.body.data.services, [{
    title: 'Игра',
    duration: 60,
    configuration: {
      participantTiers: [{ min: 1, max: 10, includedParticipants: 5, durationMinutes: 90 }],
      addons: [{ id: 'props', title: 'Реквизит', durationDelta: 15 }],
      optionGroups: [{ id: 'format', title: 'Формат', required: true, options: [{ id: 'long', title: 'Длинный', durationDelta: 30 }] }],
    },
  }])
  const withPrice = await setup({ 'orders.servicesIds': 'read', 'finance.clientAmount': 'read' }, {}, undefined, catalog).request()
  assert.deepEqual(withPrice.body.data.services, catalog)
})

test('custom service fields retain units, choices and duration rules with monetary values removed', async () => {
  const fields = [
    { id: 'distance', title: 'Расстояние', type: 'number', unit: 'км', required: true, min: 0, max: 40, pricePerUnit: 50, durationPerUnit: 2 },
    { id: 'walls', title: 'Длина стен', type: 'ranges', unit: 'м', mode: 'base', tiers: [
      { min: 0, max: 30, durationMinutes: 45, includedUnits: 10, price: 1000, pricePerUnit: 30, maxPrice: 1500 },
    ] },
    { id: 'format', title: 'Формат', type: 'select', required: true, options: [{ id: 'long', title: 'Длинный', priceDelta: 500, durationDelta: 30 }] },
    { id: 'extras', title: 'Дополнения', type: 'checkboxes', options: [{ id: 'props', title: 'Реквизит', priceDelta: 300, durationDelta: 15 }] },
  ]
  const catalog = [{ title: 'Игра', duration: 60, price: 1500, configuration: { fields } }]
  const withoutPrice = await setup({ 'orders.servicesIds': 'read' }, {}, undefined, catalog).request()
  const [safe] = withoutPrice.body.data.services
  assert.deepEqual(safe.configuration.fields.map((field) => field.type), ['number', 'ranges', 'select', 'checkboxes'])
  assert.doesNotMatch(JSON.stringify(safe), /"(?:price|pricePerUnit|maxPrice|priceDelta)":/)
  assert.equal(safe.configuration.fields[0].unit, 'км')
  assert.equal(safe.configuration.fields[0].durationPerUnit, 2)
  assert.equal(safe.configuration.fields[1].tiers[0].durationMinutes, 45)
  assert.deepEqual(safe.configuration.fields.slice(2).map((field) => field.options[0].durationDelta), [30, 15])
  const withPrice = await setup({ 'orders.servicesIds': 'read', 'finance.clientAmount': 'read' }, {}, undefined, catalog).request()
  assert.deepEqual(withPrice.body.data.services, catalog)
})

test('foreign tenant or revoked order scope cannot enumerate contextual catalogs', async () => {
  for (const patch of [{ tenantId: 'other' }, { locationId: 'other' }]) {
    const state = setup({}, patch)
    assert.equal((await state.request()).status, 404)
    assert.equal(state.filters.length, 0)
  }
})

test('malformed context order is rejected before opening models', async () => {
  const state = setup()
  assert.equal((await state.request('not-an-id')).status, 400)
  assert.equal(state.models(), 0)
})

test('returns the first unfinished step without exposing brief questions or overriding permissions', async () => {
  const grants = { 'orders.title': 'edit', 'orders.eventBrief': 'edit' }
  const briefRequests = []
  const brief = async ({ tenantId: requestedTenant, order }) => {
    briefRequests.push([requestedTenant, order._id])
    return { ok: false, missingFields: [{ label: 'Служебный вопрос' }] }
  }
  const missingClient = await setup({ ...grants, 'orders.clientId': 'edit' }, { clientId: null }, brief).request()
  assert.equal(missingClient.body.data.initialWizardStep, PARTY_ORDER_WIZARD_STEP.client)

  const missingType = await setup(grants, {}, brief).request()
  assert.equal(missingType.body.data.initialWizardStep, PARTY_ORDER_WIZARD_STEP.type)
  assert.deepEqual(briefRequests, [])

  const complete = { orderTypeId: '1'.repeat(24) }
  const missingBrief = await setup(grants, complete, brief).request()
  assert.equal(missingBrief.body.data.initialWizardStep, PARTY_ORDER_WIZARD_STEP.brief)
  assert.equal(JSON.stringify(missingBrief.body).includes('Служебный вопрос'), false)
  const hiddenBrief = await setup(
    { 'orders.title': 'edit' }, complete, brief
  ).request()
  assert.equal(hiddenBrief.body.data.initialWizardStep, null)
  assert.deepEqual(briefRequests, [[tenantId, orderId]])
  const failedBrief = await setup(grants, complete, async () => { throw Error('unavailable') }).request()
  assert.equal(failedBrief.body.data.initialWizardStep, null)
})
