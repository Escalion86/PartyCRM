export const inventoryId = (value) => String(value?._id ?? value ?? '')
export const isInventoryId = (value) =>
  /^[a-f\d]{24}$/i.test(inventoryId(value))

export const inventoryValidationError = (message, status = 400) => {
  const error = new Error(message)
  error.status = status
  return error
}

export const normalizeInventoryItem = (body) => {
  const quantity = Number(body.quantity)
  const unavailableQuantity = Number(body.unavailableQuantity ?? 0)
  if (!String(body.title || '').trim())
    throw inventoryValidationError('Укажите название реквизита')
  if (
    ![quantity, unavailableQuantity].every(
      (n) => Number.isSafeInteger(n) && n >= 0
    ) ||
    unavailableQuantity > quantity
  ) {
    throw inventoryValidationError(
      'Количество должно быть целым и неотрицательным; недоступно не больше общего количества'
    )
  }
  return {
    title: String(body.title).trim().slice(0, 180),
    category: String(body.category || '')
      .trim()
      .slice(0, 100),
    unit: String(body.unit || 'шт.')
      .trim()
      .slice(0, 30),
    storageLocation: String(body.storageLocation || '')
      .trim()
      .slice(0, 240),
    unavailableReason: String(body.unavailableReason || '')
      .trim()
      .slice(0, 500),
    quantity,
    unavailableQuantity,
    status: body.status === 'archived' ? 'archived' : 'active',
  }
}

export const normalizeInventoryRequirements = (items) => {
  if (!Array.isArray(items) || items.length > 200)
    throw inventoryValidationError('Укажите не больше 200 позиций реквизита')
  const seen = new Set()
  return items.map((item) => {
    const resourceId = inventoryId(item.resourceId)
    const quantity = Number(item.quantity)
    if (
      !isInventoryId(resourceId) ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 1000000 ||
      seen.has(resourceId)
    ) {
      throw inventoryValidationError(
        'Проверьте реквизит, количество и повторяющиеся позиции'
      )
    }
    seen.add(resourceId)
    return { resourceId, quantity }
  })
}

// The caller must load these references with its authenticated tenantId.
export const assertInventoryReferences = (ids, documents, tenantId) => {
  const available = new Set(
    documents
      .filter((item) => inventoryId(item.tenantId) === inventoryId(tenantId))
      .map((item) => inventoryId(item))
  )
  if (ids.some((id) => !available.has(inventoryId(id))))
    throw inventoryValidationError(
      'Услуга или реквизит не найдены в выбранной компании',
      404
    )
}

export const normalizeInventoryServiceItems = (items, defaults = {}) => {
  if (!Array.isArray(items) || items.length > 100)
    throw inventoryValidationError('Укажите не больше 100 услуг')
  const seen = new Set()
  return items.map((item, index) => {
    const serviceId = inventoryId(item.serviceId)
    const serviceLineId = String(
      item.serviceLineId || `${serviceId}:${index}`
    ).slice(0, 100)
    const startAt = new Date(item.startAt || defaults.eventDate)
    const endAt = new Date(item.endAt || defaults.dateEnd)
    const quantity = Number(item.quantity ?? 1)
    if (
      !isInventoryId(serviceId) ||
      seen.has(serviceLineId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000 ||
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt
    ) {
      throw inventoryValidationError(
        'Проверьте услугу, количество и время начала/окончания каждой услуги'
      )
    }
    seen.add(serviceLineId)
    return {
      serviceId,
      serviceLineId,
      quantity,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(item.resources !== undefined
        ? { resources: normalizeInventoryRequirements(item.resources) }
        : {}),
    }
  })
}

export const buildInventoryDemand = (serviceItems, requirements) => {
  const byService = new Map(
    requirements.map((item) => [inventoryId(item.serviceId), item.items])
  )
  return serviceItems.flatMap((service) =>
    (service.resources ?? byService.get(service.serviceId) ?? []).map(
      (item) => ({
        resourceId: inventoryId(item.resourceId),
        serviceId: service.serviceId,
        serviceLineId: service.serviceLineId,
        startAt: service.startAt,
        endAt: service.endAt,
        // Manual resources are already the total for the line; default norms are per service.
        quantity: item.quantity * (service.resources ? 1 : service.quantity),
      })
    )
  )
}

export const reconcileInventoryServiceItems = (order, previous = null) => {
  const eventDate = order.eventDate
    ? new Date(order.eventDate).toISOString()
    : ''
  const dateEnd = order.dateEnd
    ? new Date(order.dateEnd).toISOString()
    : eventDate
      ? new Date(
          +new Date(eventDate) + (order.durationMinutes || 60) * 60000
        ).toISOString()
      : ''
  const serviceIds = (order.servicesIds || []).map(inventoryId)
  // Existing selections are snapshots, even if originally selected automatically.
  // Editing a service norm must not silently change a previously booked kit.
  const manual = previous?.serviceItems || []
  const oldStart = previous?.orderSnapshot?.eventDate
  const oldEnd = previous?.orderSnapshot?.dateEnd
  const sameTime = (left, right) =>
    Boolean(left && right && +new Date(left) === +new Date(right))
  const lines = manual
    .filter((line) => serviceIds.includes(inventoryId(line.serviceId)))
    .map((line) => ({
      ...line,
      startAt:
        !line.startAt || sameTime(line.startAt, oldStart)
          ? eventDate
          : line.startAt,
      endAt: !line.endAt || sameTime(line.endAt, oldEnd) ? dateEnd : line.endAt,
    }))
  for (const [index, serviceId] of serviceIds.entries()) {
    if (!lines.some((line) => inventoryId(line.serviceId) === serviceId))
      lines.push({
        serviceId,
        serviceLineId: `${serviceId}:${index}`,
        quantity: 1,
        startAt: eventDate,
        endAt: dateEnd,
      })
  }
  return {
    serviceItems: lines,
    orderSnapshot: { eventDate, dateEnd, servicesIds: serviceIds },
  }
}

export const calculateInventoryAvailability = ({
  items,
  demand,
  reservations = [],
  holdings = [],
  excludeOrderId = '',
}) => {
  const warnings = []
  const holdingRisks = []
  const rows = reservations.filter(
    (row) =>
      row.status !== 'released' &&
      (!excludeOrderId ||
        inventoryId(row.orderId) !== inventoryId(excludeOrderId))
  )
  for (const item of items) {
    const resourceId = inventoryId(item)
    const requested = demand.filter(
      (row) => inventoryId(row.resourceId) === resourceId
    )
    if (!requested.length) continue
    const existing = rows.filter(
      (row) => inventoryId(row.resourceId) === resourceId
    )
    const resourceHoldings = holdings.filter(
      (holding) =>
        inventoryId(holding.resourceId) === resourceId && holding.quantity > 0
    )
    const horizon = Math.max(...requested.map((row) => +new Date(row.endAt)))
    for (const holding of resourceHoldings) {
      if (
        (!excludeOrderId ||
          inventoryId(holding.orderId) !== inventoryId(excludeOrderId)) &&
        +new Date(holding.issuedAt) < horizon
      )
        holdingRisks.push({ ...holding, resourceId, title: item.title })
    }
    const events = new Map()
    const add = (row, source, index) => {
      const key = `${source}:${index}`
      for (const [time, entering] of [
        [+new Date(row.startAt), true],
        [+new Date(row.endAt), false],
      ]) {
        if (!events.has(time)) events.set(time, [])
        events.get(time).push({ entering, key, row, source })
      }
    }
    requested.forEach((row, index) => add(row, 'requested', index))
    existing.forEach((row, index) => add(row, 'existing', index))
    resourceHoldings.forEach((holding, index) => {
      if (+new Date(holding.issuedAt) < horizon)
        add(
          {
            ...holding,
            startAt: holding.issuedAt,
            endAt: new Date(horizon).toISOString(),
          },
          'holding',
          index
        )
    })
    const times = [...events.keys()].sort((a, b) => a - b)
    const active = new Map()
    const availableQuantity =
      item.status === 'archived'
        ? 0
        : Math.max(0, Number(item.quantity || 0) - Number(item.unavailableQuantity || 0))
    for (let i = 0; i < times.length - 1; i += 1) {
      // Apply all end/start changes at the same instant before inspecting [t, next).
      for (const event of events.get(times[i])) {
        if (event.entering) active.set(event.key, event)
        else active.delete(event.key)
      }
      const current = [...active.values()]
      const requestedRows = current
        .filter((event) => event.source === 'requested')
        .map((event) => event.row)
      const occupiedRows = current
        .filter((event) => event.source === 'existing')
        .map((event) => event.row)
      const heldRows = current
        .filter((event) => event.source === 'holding')
        .map((event) => event.row)
      const ownHeld = heldRows
        .filter(
          (row) =>
            excludeOrderId &&
            inventoryId(row.orderId) === inventoryId(excludeOrderId)
        )
        .reduce((sum, row) => sum + row.quantity, 0)
      const foreignHeld = heldRows.filter(
        (row) =>
          !excludeOrderId ||
          inventoryId(row.orderId) !== inventoryId(excludeOrderId)
      )
      const byOrder = new Map()
      for (const row of occupiedRows) {
        const key = inventoryId(row.orderId)
        const entry = byOrder.get(key) || { reserved: 0, held: 0 }
        entry.reserved += row.quantity
        byOrder.set(key, entry)
      }
      for (const row of foreignHeld) {
        const key = inventoryId(row.orderId)
        const entry = byOrder.get(key) || { reserved: 0, held: 0 }
        entry.held += row.quantity
        byOrder.set(key, entry)
      }
      const requestedQuantity = requestedRows.reduce(
        (sum, row) => sum + row.quantity,
        0
      )
      const needed = Math.max(requestedQuantity, ownHeld)
      const occupied = [...byOrder.values()].reduce(
        (sum, entry) => sum + Math.max(entry.reserved, entry.held),
        0
      )
      if (requestedQuantity && needed + occupied > availableQuantity)
        warnings.push({
          resourceId,
          title: item.title,
          quantity: item.quantity,
          unavailableQuantity: item.unavailableQuantity,
          availableQuantity,
          needed,
          occupied,
          heldQuantity: heldRows.reduce((sum, row) => sum + row.quantity, 0),
          shortage: needed + occupied - availableQuantity,
          startAt: new Date(times[i]).toISOString(),
          endAt: new Date(times[i + 1]).toISOString(),
          conflicts: occupiedRows.map(
            ({ orderId, serviceId, serviceLineId, quantity, orderTitle }) => ({
              orderId,
              serviceId,
              serviceLineId,
              quantity,
              orderTitle,
            })
          ),
          serviceLineIds: requestedRows.map((row) => row.serviceLineId),
          holders: foreignHeld.map(
            ({
              holderStaffId,
              holderName,
              orderId,
              orderTitle,
              quantity,
              expectedReturnAt,
            }) => ({
              holderStaffId,
              holderName,
              orderId,
              orderTitle,
              quantity,
              expectedReturnAt,
            })
          ),
        })
    }
  }
  return { hasShortage: warnings.length > 0, warnings, demand, holdingRisks }
}
