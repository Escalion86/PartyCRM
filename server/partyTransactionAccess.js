import { canPartyAccess } from '../helpers/partyRolePermissions.js'

export const partyTransactionPermission = (transaction) =>
  transaction.type === 'income'
    ? 'finance.payments'
    : transaction.category === 'payout'
      ? 'finance.payouts'
      : 'finance.expenses'

export const canAccessPartyTransaction = (
  context,
  transaction,
  order,
  action = 'read'
) =>
  canPartyAccess(context, { resource: 'orders', action: 'read', order }) &&
  canPartyAccess(context, {
    resource: partyTransactionPermission(transaction),
    action,
    order,
  })
