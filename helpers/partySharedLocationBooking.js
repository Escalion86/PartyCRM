// These fields are snapshots issued by the server, not editable order inputs.
// This predicate only exempts a location overlap; staff and inventory still conflict.
export const sharePartyLocationBooking = (order, other) =>
  order?.sharedLocationBooking === true &&
  other?.sharedLocationBooking === true &&
  Boolean(order.partyEventGroupId) &&
  Boolean(other.partyEventGroupId) &&
  String(order.partyEventGroupId) === String(other.partyEventGroupId)
