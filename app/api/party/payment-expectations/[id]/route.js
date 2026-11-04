import {
  partyExpectationRoute,
  mutatePartyPaymentExpectation,
} from '@server/partyPaymentExpectations'

export const PATCH = partyExpectationRoute((args) =>
  mutatePartyPaymentExpectation({ ...args, expectationId: args.params.id })
)
