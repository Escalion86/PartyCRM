import {
  partyExpectationRoute,
  listPartyOrderExpectations,
  createPartyPaymentExpectation,
} from '@server/partyPaymentExpectations'

export const GET = partyExpectationRoute(({ context, req }) =>
  listPartyOrderExpectations({
    context,
    orderId: new URL(req.url).searchParams.get('orderId'),
  })
)
export const POST = partyExpectationRoute(createPartyPaymentExpectation)
