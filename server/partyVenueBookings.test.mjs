import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPartyVenueBookingService,
  createPartyOrderVenueWriter,
  supportsPartyVenueTransactions,
} from './partyVenueBookings.js'

const tenantId = 'a'.repeat(24),
  locationId = 'b'.repeat(24),
  otherVenue = 'c'.repeat(24)
const id = (number) => number.toString(16).padStart(24, '0')
const range = (overrides = {}) => ({
  locationId,
  startsAt: new Date('2026-12-01T10:00:00Z'),
  endsAt: new Date('2026-12-01T11:00:00Z'),
  ...overrides,
})
const clone = (value) => structuredClone(value)
const valueOf = (row, value) => {
  if (typeof value === 'string' && value.startsWith('$'))
    return row[value.slice(1)]
  if (value?.$ifNull)
    return valueOf(row, value.$ifNull[0]) ?? valueOf(row, value.$ifNull[1])
  if (value?.$multiply)
    return value.$multiply
      .map((part) => valueOf(row, part))
      .reduce((a, b) => a * b, 1)
  if (value?.$add)
    return value.$add
      .map((part) => +valueOf(row, part))
      .reduce((a, b) => a + b, 0)
  return value
}
const matches = (row, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(row, part))
    if (key === '$expr')
      return +valueOf(row, value.$gt[0]) > +valueOf(row, value.$gt[1])
    if (value && typeof value === 'object' && !(value instanceof Date))
      return Object.entries(value).every(([op, bound]) =>
        op === '$ne'
          ? String(row[key] ?? '') !== String(bound ?? '')
          : op === '$in'
            ? bound.some((item) => String(row[key]) === String(item))
            : op === '$lt'
              ? +row[key] < +bound
              : op === '$lte'
                ? +row[key] <= +bound
                : op === '$gt'
                  ? +row[key] > +bound
                  : false
      )
    return value === null
      ? row[key] == null
      : String(row[key]) === String(value)
  })
const query = (read) => ({
  session(session) {
    this.current = session
    return this
  },
  select() {
    return this
  },
  async lean() {
    return clone(await read(this.current))
  },
})

function setup(location = {}, orders = []) {
  const env = {
    locations: [
      {
        _id: locationId,
        tenantId,
        status: 'active',
        usageMode: 'exclusive',
        capacity: 10,
        preparationMinutes: 0,
        cleanupMinutes: 0,
        ...location,
      },
      { _id: otherVenue, tenantId, status: 'active', usageMode: 'exclusive' },
    ],
    orders: clone(orders),
    bookings: [],
    locks: [],
    ended: 0,
    modelReads: 0,
    tails: new Map(),
  }
  const save = (session, collection, filter, update, insert = false) => {
    assert.equal(session.active, true)
    let row = collection.find((entry) => matches(entry, filter))
    const previous = row ? clone(row) : null
    if (!row && insert) {
      row = clone(filter)
      collection.push(row)
    }
    if (!row) return null
    session.undo.push(() => {
      const index = collection.indexOf(row)
      if (previous) {
        for (const key of Object.keys(row)) delete row[key]
        Object.assign(row, previous)
      } else if (index >= 0) collection.splice(index, 1)
    })
    Object.assign(row, clone(update.$set || {}))
    for (const [key, amount] of Object.entries(update.$inc || {}))
      row[key] = (row[key] || 0) + amount
    return row
  }
  const startSession = async () => {
    const session = {
      active: false,
      undo: [],
      held: new Set(),
      releases: [],
      inTransaction() {
        return this.active
      },
      async endSession() {
        env.ended += 1
      },
      async withTransaction(work) {
        this.active = true
        try {
          return await work()
        } catch (error) {
          for (const undo of this.undo.reverse()) undo()
          throw error
        } finally {
          this.active = false
          for (const release of this.releases) release()
        }
      },
    }
    return session
  }
  const acquire = async (session, key) => {
    if (session.held.has(key)) return
    const previous = env.tails.get(key) || Promise.resolve()
    let release
    env.tails.set(
      key,
      new Promise((resolve) => {
        release = resolve
      })
    )
    await previous
    session.held.add(key)
    session.releases.push(release)
  }
  const models = {
    Locations: {
      find: (filter) =>
        query(() => env.locations.filter((row) => matches(row, filter))),
      findOne: (filter) =>
        query(() => env.locations.find((row) => matches(row, filter)) || null),
      findOneAndUpdate: (filter, update, options) =>
        query(async (session) => {
          assert.equal(options.session, session)
          await acquire(session, filter.tenantId + ':' + filter._id)
          return save(session, env.locations, filter, update)
        }),
    },
    Orders: {
      find: (filter) =>
        query(() => env.orders.filter((row) => matches(row, filter))),
      findOne: (filter) =>
        query(() => env.orders.find((row) => matches(row, filter)) || null),
    },
    Bookings: {
      init: async () => {},
      find: (filter) =>
        query(() => env.bookings.filter((row) => matches(row, filter))),
      findOne: (filter) =>
        query(() => env.bookings.find((row) => matches(row, filter)) || null),
      updateOne: async (filter, update, { session }) => {
        save(session, env.bookings, filter, update, true)
        return { modifiedCount: 1 }
      },
      deleteOne: async (filter, { session }) => {
        assert.equal(session.active, true)
        const row = env.bookings.find((entry) => matches(entry, filter))
        if (row) {
          env.bookings.splice(env.bookings.indexOf(row), 1)
          session.undo.push(() => env.bookings.push(row))
        }
      },
    },
    Locks: {
      init: async () => {},
      db: { startSession },
      updateOne: async (filter, update, { session }) => {
        assert.equal(session.active, true)
        env.locks.push(clone(filter))
        return { modifiedCount: 1 }
      },
    },
  }
  const service = createPartyVenueBookingService({
    getModels: async () => {
      env.modelReads += 1
      return models
    },
    now: () => +new Date('2026-11-01T00:00:00Z'),
  })
  const reserve = (sourceId, data = {}) =>
    service.withPartyVenueMutation({
      tenantId,
      bookings: [range(data)],
      work: ({ session }) =>
        service.reservePartyVenue({
          tenantId,
          sourceType: 'ticket_session',
          sourceId,
          ...range(data),
          status: 'scheduled',
          capacity: 6,
          ...data,
          session,
        }),
    })
  return { env, models, service, reserve, startSession }
}

test('availability preview uses the same ticket/buffer checks without locks, writes or migrations', async () => {
  const h = setup({ cleanupMinutes: 15 })
  await h.reserve(id(1))
  const before = clone({
    locations: h.env.locations,
    bookings: h.env.bookings,
    locks: h.env.locks,
  })
  await assert.rejects(
    h.service.checkPartyVenueAvailability({
      tenantId,
      ...range({
        startsAt: new Date('2026-12-01T11:05:00Z'),
        endsAt: new Date('2026-12-01T12:05:00Z'),
      }),
    }),
    { code: 'partycrm_venue_conflict' }
  )
  assert.deepEqual(
    {
      locations: h.env.locations,
      bookings: h.env.bookings,
      locks: h.env.locks,
    },
    before
  )
})

test('entry checks are point-in-time with preparation/cleanup bounds; canceled and other-tenant orders do not block', async () => {
  const order = {
    _id: id(50),
    tenantId,
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'closed',
    title: 'Never expose this private title',
  }
  const h = setup({ preparationMinutes: 20, cleanupMinutes: 15 }, [order])
  const enter = (at) =>
    h.service.withPartyVenueMutation({
      tenantId,
      locationIds: [locationId],
      at,
      work: ({ session }) =>
        h.service.assertPartyVenueEntryAllowed({
          tenantId,
          locationId,
          at,
          session,
        }),
    })
  await enter('2026-12-01T09:39:59Z')
  await assert.rejects(
    enter('2026-12-01T09:40:00Z'),
    (error) =>
      error.code === 'partycrm_venue_entry_blocked' &&
      !error.message.includes(order.title)
  )
  await assert.rejects(enter('2026-12-01T11:14:59Z'), {
    code: 'partycrm_venue_entry_blocked',
  })
  await enter('2026-12-01T11:15:00Z')
  h.env.orders[0].status = 'canceled'
  await enter('2026-12-01T10:30:00Z')
  h.env.orders[0].status = 'active'
  h.env.orders[0].tenantId = 'd'.repeat(24)
  await enter('2026-12-01T10:30:00Z')
  assert.equal(
    h.env.bookings.length,
    0,
    'Entry never reserves an invented visit duration'
  )
  assert.ok(h.env.locks.every((lock) => lock.day === '2026-12-01'))
})

test('own scheduled session permits admission, other exclusive sessions block it, shared sessions do not invent visitor occupancy', async () => {
  const h = setup()
  await h.reserve(id(1))
  const enter = (excludeTicketSessionId) =>
    h.service.withPartyVenueMutation({
      tenantId,
      locationIds: [locationId],
      at: '2026-12-01T10:30:00Z',
      work: ({ session }) =>
        h.service.assertPartyVenueEntryAllowed({
          tenantId,
          locationId,
          at: '2026-12-01T10:30:00Z',
          session,
          excludeTicketSessionId,
        }),
    })
  await assert.rejects(enter(null), { code: 'partycrm_venue_entry_blocked' })
  await enter(id(1))
  h.env.locations[0].usageMode = 'shared'
  await enter(null)
  assert.equal(h.env.bookings.length, 1)
})

test('entry waits for a concurrent private booking commit and then rejects the occupied instant', async () => {
  const h = setup()
  const writer = createPartyOrderVenueWriter({
    getModels: async () => h.models,
    supportsTransactions: async () => true,
    withVenueMutation: h.service.withPartyVenueMutation,
    reserveVenue: h.service.reservePartyVenue,
  })
  let enteredLock, release
  const locked = new Promise((resolve) => {
    enteredLock = resolve
  })
  const wait = new Promise((resolve) => {
    release = resolve
  })
  const order = {
    _id: id(50),
    tenantId,
    placeType: 'company_location',
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'active',
  }
  const booking = writer({
    tenantId,
    nextOrder: order,
    work: async () => {
      h.env.orders.push(order)
      enteredLock()
      await wait
      return order
    },
  })
  await locked
  const admission = h.service.withPartyVenueMutation({
    tenantId,
    locationIds: [locationId],
    at: '2026-12-01T10:30:00Z',
    work: ({ session }) =>
      h.service.assertPartyVenueEntryAllowed({
        tenantId,
        locationId,
        at: '2026-12-01T10:30:00Z',
        session,
      }),
  })
  release()
  await booking
  await assert.rejects(admission, { code: 'partycrm_venue_entry_blocked' })
})

test('an outer financial transaction propagates the same session through order, venue, and a venue-free order', async () => {
  const h = setup()
  const writer = createPartyOrderVenueWriter({
    getModels: () => {
      throw new Error('External transaction must skip topology fallback')
    },
    supportsTransactions: () => {
      throw new Error('External transaction is already strict')
    },
    withVenueMutation: h.service.withPartyVenueMutation,
    reserveVenue: h.service.reservePartyVenue,
  })
  const session = await h.startSession()
  const order = {
    _id: id(50),
    tenantId,
    placeType: 'company_location',
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'active',
  }
  await session.withTransaction(async () => {
    await writer({
      tenantId,
      nextOrder: order,
      session,
      work: ({ session: actual, legacy }) => {
        assert.equal(actual, session)
        assert.equal(legacy, false)
        h.env.orders.push(order)
        return order
      },
    })
    await writer({
      tenantId,
      nextOrder: { placeType: 'client_address' },
      session,
      work: ({ session: actual, legacy }) => {
        assert.equal(actual, session)
        assert.equal(legacy, false)
        return null
      },
    })
  })
  assert.equal(h.env.bookings[0].sourceId, order._id)
  assert.equal(h.env.ended, 0)
})

test('ordinary order and ticket reservation race uses the same venue lock and rolls back the loser', async () => {
  const h = setup()
  const writer = createPartyOrderVenueWriter({
    getModels: async () => h.models,
    supportsTransactions: async () => true,
    withVenueMutation: h.service.withPartyVenueMutation,
    reserveVenue: h.service.reservePartyVenue,
  })
  const order = {
    _id: id(50),
    tenantId,
    placeType: 'company_location',
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'active',
  }
  const results = await Promise.allSettled([
    h.reserve(id(1)),
    writer({
      tenantId,
      nextOrder: order,
      work: async ({ session }) => {
        h.env.orders.push(order)
        session.undo.push(() => {
          h.env.orders.splice(h.env.orders.indexOf(order), 1)
        })
        return order
      },
    }),
  ])
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
  assert.equal(
    results.find((row) => row.status === 'rejected').reason.status,
    409
  )
  assert.equal(
    h.env.orders.length +
      h.env.bookings.filter((row) => row.sourceType === 'ticket_session')
        .length,
    1
  )
})

test('standalone compatibility permits only a fresh module-off company and unmanaged venue', async () => {
  const h = setup()
  h.models.Companies = {
    findOne: () =>
      query(() => ({
        _id: tenantId,
        settings: {
          modules: { ticketing: { enabled: h.env.moduleEnabled === true } },
        },
      })),
  }
  const writer = createPartyOrderVenueWriter({
    getModels: async () => h.models,
    supportsTransactions: async () => false,
    withVenueMutation: () => {
      throw new Error('No replica transaction allowed')
    },
  })
  const nextOrder = {
    locationId,
    eventDate: range().startsAt,
    dateEnd: null,
    durationMinutes: 60,
  }
  let calls = 0
  await writer({
    tenantId,
    nextOrder,
    work: ({ session, legacy }) => {
      assert.equal(session, null)
      assert.equal(legacy, true)
      calls += 1
    },
  })
  assert.equal(calls, 1)
  h.env.moduleEnabled = true
  await assert.rejects(writer({ tenantId, nextOrder, work: () => calls++ }), {
    status: 503,
  })
  h.env.moduleEnabled = false
  h.env.locations[0].venueBookingManaged = true
  await assert.rejects(writer({ tenantId, nextOrder, work: () => calls++ }), {
    status: 503,
  })
  assert.equal(calls, 1)
})

test('parallel exclusive reservations serialize before reading occupancy; one survives', async () => {
  const h = setup()
  const results = await Promise.allSettled([h.reserve(id(1)), h.reserve(id(2))])
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
  assert.equal(
    results.find((row) => row.status === 'rejected').reason.status,
    409
  )
  assert.equal(h.env.bookings.length, 1)
  assert.equal(h.env.ended, 2)
  assert.ok(
    h.env.locks.every(
      (lock) =>
        lock.tenantId === tenantId &&
        lock.locationId === locationId &&
        lock.day === '2026-12-01'
    )
  )
})

test('parallel shared capacity allocations cannot oversubscribe the venue', async () => {
  const h = setup({ usageMode: 'shared', capacity: 10 })
  const results = await Promise.allSettled([h.reserve(id(1)), h.reserve(id(2))])
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
  assert.match(
    results.find((row) => row.status === 'rejected').reason.message,
    /Суммарная вместимость/
  )
  assert.equal(
    h.env.bookings.reduce((sum, row) => sum + row.capacity, 0),
    6
  )
})

test('shared sessions can fit together; missing venue capacity never allows a second overlapping session', async () => {
  const h = setup({ usageMode: 'shared', capacity: 12 })
  await Promise.all([h.reserve(id(1)), h.reserve(id(2))])
  assert.equal(h.env.bookings.length, 2)
  const unknown = setup({ usageMode: 'shared', capacity: null })
  await unknown.reserve(id(1))
  await assert.rejects(unknown.reserve(id(2)), /Укажите вместимость площадки/)
})

test('private orders are exclusive on shared venues; trusted group exception does not exempt ticket sessions', async () => {
  const order = {
    _id: id(50),
    tenantId,
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'closed',
    partyEventGroupId: id(60),
    sharedLocationBooking: true,
  }
  const h = setup({ usageMode: 'shared' }, [order])
  await assert.rejects(h.reserve(id(1)), { status: 409 })
  h.env.orders[0].status = 'canceled'
  await h.reserve(id(1))
  await assert.rejects(
    h.service.withPartyVenueMutation({
      tenantId,
      bookings: [range()],
      work: ({ session }) =>
        h.service.reservePartyVenue({
          tenantId,
          sourceType: 'order',
          sourceId: id(51),
          ...range(),
          status: 'active',
          session,
        }),
    }),
    { status: 409 }
  )
})

test('venue buffers and null legacy dateEnd are respected across UTC day boundaries', async () => {
  const h = setup({ preparationMinutes: 20, cleanupMinutes: 20 }, [
    {
      _id: id(50),
      tenantId,
      locationId,
      eventDate: new Date('2026-12-01T23:30:00Z'),
      dateEnd: null,
      durationMinutes: 60,
      status: 'active',
    },
  ])
  await assert.rejects(
    h.reserve(id(1), {
      startsAt: new Date('2026-12-02T00:40:00Z'),
      endsAt: new Date('2026-12-02T01:40:00Z'),
    }),
    { status: 409 }
  )
  const free = setup({ cleanupMinutes: 20 })
  await free.reserve(id(1), {
    startsAt: new Date('2026-12-01T23:00:00Z'),
    endsAt: new Date('2026-12-01T23:50:00Z'),
  })
  assert.deepEqual(
    free.env.locks.map((lock) => lock.day),
    ['2026-12-01', '2026-12-02']
  )
})

test('external ticket transaction owns commit/rollback and reservation writes roll back on downstream failure', async () => {
  const h = setup()
  const session = await h.startSession()
  await assert.rejects(
    session.withTransaction(() =>
      h.service.withPartyVenueMutation({
        tenantId,
        bookings: [range()],
        session,
        work: async ({ session }) => {
          await h.service.reservePartyVenue({
            tenantId,
            sourceType: 'ticket_session',
            sourceId: id(1),
            ...range(),
            status: 'scheduled',
            capacity: 5,
            session,
          })
          throw new Error('Ticket write failed')
        },
      })
    ),
    /Ticket write failed/
  )
  assert.equal(h.env.bookings.length, 0)
  assert.equal(h.env.locations[0].venueBookingManaged, undefined)
  assert.equal(h.env.ended, 0)
})

test('cancel and untimed transitions release the reservation without blocking the whole day', async () => {
  const h = setup()
  await h.reserve(id(1))
  await h.reserve(id(1), { status: 'canceled' })
  assert.equal(h.env.bookings.length, 0)
  await h.reserve(id(2), { startsAt: null, endsAt: null })
  assert.equal(h.env.bookings.length, 0)
  await h.reserve(id(3))
  assert.equal(h.env.bookings.length, 1)
})

test('configuration reductions cannot invalidate sold/shared allocations; failure leaves settings intact', async () => {
  const h = setup({ usageMode: 'shared', capacity: 12 })
  await h.reserve(id(1))
  await h.reserve(id(2))
  await assert.rejects(
    h.service.updatePartyVenueConfiguration({
      tenantId,
      locationId,
      patch: { capacity: 10 },
    }),
    { status: 409 }
  )
  assert.equal(h.env.locations[0].capacity, 12)
  await assert.rejects(
    h.service.updatePartyVenueConfiguration({
      tenantId,
      locationId,
      patch: { usageMode: 'exclusive' },
    }),
    { status: 409 }
  )
  assert.equal(h.env.locations[0].usageMode, 'shared')
})

test('buffer growth cannot introduce a conflict between adjacent existing sessions', async () => {
  const h = setup({ capacity: 12 })
  await h.reserve(id(1))
  await h.reserve(id(2), {
    startsAt: new Date('2026-12-01T11:00:00Z'),
    endsAt: new Date('2026-12-01T12:00:00Z'),
  })
  await assert.rejects(
    h.service.updatePartyVenueConfiguration({
      tenantId,
      locationId,
      patch: { cleanupMinutes: 10 },
    }),
    { status: 409 }
  )
  assert.equal(h.env.locations[0].cleanupMinutes, 0)
  assert.equal(h.env.bookings.length, 2)
})

test('stored group members retain their venue exemption; independent orders cannot forge it', async () => {
  const shared = {
    tenantId,
    locationId,
    eventDate: range().startsAt,
    dateEnd: range().endsAt,
    status: 'active',
    partyEventGroupId: id(60),
    sharedLocationBooking: true,
  }
  const h = setup({}, [
    { ...shared, _id: id(1) },
    { ...shared, _id: id(2) },
  ])
  await h.service.withPartyVenueMutation({
    tenantId,
    bookings: [range()],
    work: ({ session }) =>
      h.service.reservePartyVenue({
        tenantId,
        sourceType: 'order',
        sourceId: id(1),
        ...range(),
        status: 'active',
        session,
      }),
  })
  await assert.rejects(
    h.service.withPartyVenueMutation({
      tenantId,
      bookings: [range()],
      work: ({ session }) =>
        h.service.reservePartyVenue({
          tenantId,
          sourceType: 'order',
          sourceId: id(3),
          ...range(),
          status: 'active',
          session,
        }),
    }),
    { status: 409 }
  )
})

test('removing the stored shared-group exemption cannot hide a preparation/cleanup collision', async () => {
  const shared = {
    tenantId,
    locationId,
    status: 'active',
    partyEventGroupId: id(60),
    sharedLocationBooking: true,
  }
  const h = setup({ cleanupMinutes: 15 }, [
    {
      ...shared,
      _id: id(1),
      eventDate: range().startsAt,
      dateEnd: range().endsAt,
    },
    {
      ...shared,
      _id: id(2),
      eventDate: range().endsAt,
      dateEnd: new Date('2026-12-01T12:00:00Z'),
    },
  ])
  await assert.rejects(
    h.service.withPartyVenueMutation({
      tenantId,
      bookings: [
        range(),
        range({
          startsAt: range().endsAt,
          endsAt: new Date('2026-12-01T12:00:00Z'),
        }),
      ],
      work: async ({ session }) => {
        for (const order of h.env.orders) {
          order.sharedLocationBooking = false
          session.undo.push(() => {
            order.sharedLocationBooking = true
          })
        }
        await h.service.checkPartyVenueAvailability({
          tenantId,
          sourceId: id(1),
          ...range(),
          session,
        })
      },
    }),
    { code: 'partycrm_venue_conflict' }
  )
  assert.ok(h.env.orders.every((order) => order.sharedLocationBooking))
})

test('an undated private draft never creates a venue reservation or activates managed mode', async () => {
  let writes = 0
  const writer = createPartyOrderVenueWriter({
    getModels: () => {
      throw new Error('Untimed draft needs no venue infrastructure')
    },
  })
  await writer({
    tenantId,
    nextOrder: { locationId, eventDate: null, dateEnd: null },
    work: ({ session, legacy }) => {
      assert.equal(session, null)
      assert.equal(legacy, true)
      writes += 1
    },
  })
  assert.equal(writes, 1)
})

test('moving a reservation requires both venues locked and a failed move retains the old booking', async () => {
  const h = setup()
  await h.reserve(id(1))
  await assert.rejects(
    h.service.withPartyVenueMutation({
      tenantId,
      bookings: [range({ locationId: otherVenue })],
      work: ({ session }) =>
        h.service.reservePartyVenue({
          tenantId,
          sourceType: 'ticket_session',
          sourceId: id(1),
          ...range({ locationId: otherVenue }),
          status: 'scheduled',
          capacity: 5,
          session,
        }),
    }),
    { code: 'partycrm_venue_lock_required' }
  )
  assert.equal(String(h.env.bookings[0].locationId), locationId)
  await h.service.withPartyVenueMutation({
    tenantId,
    bookings: [range({ locationId: otherVenue }), range()],
    work: ({ session }) =>
      h.service.reservePartyVenue({
        tenantId,
        sourceType: 'ticket_session',
        sourceId: id(1),
        ...range({ locationId: otherVenue }),
        status: 'scheduled',
        capacity: 5,
        session,
      }),
  })
  assert.equal(String(h.env.bookings[0].locationId), otherVenue)
})

test('malformed IDs fail before a model is loaded; a booking outside the venue transaction cannot write', async () => {
  const h = setup()
  await assert.rejects(
    h.service.withPartyVenueMutation({ tenantId: { $ne: '' }, work() {} }),
    { status: 400 }
  )
  await assert.rejects(
    h.service.withPartyVenueMutation({
      tenantId,
      bookings: [range({ locationId: 'bad' })],
      work() {},
    }),
    { status: 400 }
  )
  assert.equal(h.env.modelReads, 0)
  await assert.rejects(
    h.service.reservePartyVenue({
      tenantId,
      sourceType: 'ticket_session',
      sourceId: id(1),
      ...range(),
      status: 'scheduled',
      capacity: 5,
    }),
    { status: 503 }
  )
  assert.equal(h.env.bookings.length, 0)
})

test('topology helper distinguishes replica/sharded transactions from standalone without hiding command errors', async () => {
  const model = (hello) => ({
    db: { db: { admin: () => ({ command: async () => hello }) } },
  })
  assert.equal(
    await supportsPartyVenueTransactions(model({ setName: 'replica' })),
    true
  )
  assert.equal(
    await supportsPartyVenueTransactions(model({ msg: 'isdbgrid' })),
    true
  )
  assert.equal(
    await supportsPartyVenueTransactions(model({ isWritablePrimary: true })),
    false
  )
  await assert.rejects(
    supportsPartyVenueTransactions({
      db: {
        db: {
          admin() {
            throw new Error('offline')
          },
        },
      },
    }),
    { status: 503 }
  )
})
