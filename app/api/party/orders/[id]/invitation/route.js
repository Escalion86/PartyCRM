import {
  invitationRoute,
  readPartyOrderInvitation,
  savePartyOrderInvitation,
} from '@server/partyInvitations'

export const GET = invitationRoute(({ context, params }) =>
  readPartyOrderInvitation({ context, orderId: params.id })
)
export const PUT = invitationRoute(({ context, params, body }) =>
  savePartyOrderInvitation({ context, orderId: params.id, body })
)
