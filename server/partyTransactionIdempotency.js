import { createHash } from 'node:crypto'

export const buildPartyTransactionRequestIdentity = ({
  key,
  tenantId,
  actorId,
  body,
  payload,
}) => {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(String(key || '')) ||
    !actorId
  )
    throw Object.assign(new Error('Некорректный ключ денежной операции'), {
      status: 400,
      code: 'partycrm_invalid_idempotency_key',
    })
  if (body.date && !Number.isFinite(+new Date(body.date)))
    throw Object.assign(new Error('Некорректная дата денежной операции'), {
      status: 400,
      code: 'partycrm_invalid_transaction_date',
    })
  const fingerprint = {
    tenantId: String(tenantId),
    actorId: String(actorId),
    orderId: payload.orderId,
    clientId: payload.clientId,
    staffId: payload.staffId,
    amount: payload.amount,
    type: payload.type,
    category: payload.category,
    // An omitted date means "now" on the first request. Retries must keep the
    // original transaction date rather than hash their new server clock time.
    date: body.date ? payload.date.toISOString() : null,
    comment: payload.comment,
    paymentMethod: payload.paymentMethod,
  }
  return {
    idempotencyKey: String(key),
    idempotencyActorId: String(actorId),
    requestFingerprint: createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex'),
  }
}
