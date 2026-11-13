const getOrderDurationMinutes = (order) => {
  const explicit = Number(order.durationMinutes)
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit)

  const start = order.eventDate ? new Date(order.eventDate) : null
  const end = order.dateEnd ? new Date(order.dateEnd) : null
  if (start && end && end > start) {
    return Math.max(Math.round((end - start) / 60000), 1)
  }
  return 60
}

export const normalizePartyLegacyOrderDraft = (order) => ({
  ...order,
  durationMinutes: String(getOrderDurationMinutes(order)),
  contractAmount: order.contractAmount ?? order.clientPayment?.totalAmount ?? '',
  clientPayment: {
    totalAmount: order.clientPayment?.totalAmount ?? order.contractAmount ?? '',
    prepaidAmount: order.clientPayment?.prepaidAmount ?? '',
    status: order.clientPayment?.status ?? 'none',
  },
  transactions: Array.isArray(order.transactions) ? order.transactions : [],
  additionalEvents: Array.isArray(order.additionalEvents)
    ? order.additionalEvents.map((item) => ({ ...item, responsibleStaffId: item?.responsibleStaffId || '' }))
    : [],
  otherContacts: Array.isArray(order.otherContacts) ? order.otherContacts : [],
  clientAddress: {
    town: order.clientAddress?.town ?? '',
    street: order.clientAddress?.street ?? '',
    house: order.clientAddress?.house ?? '',
    room: order.clientAddress?.room ?? '',
    comment: order.clientAddress?.comment ?? '',
  },
  responsibleStaffId: order.responsibleStaffId || '',
})
