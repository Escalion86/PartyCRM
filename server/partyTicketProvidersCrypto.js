import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const unavailable = () => Object.assign(new Error('Защищённое хранилище подключений не настроено. Обратитесь к администратору сервера.'), { status: 503, code: 'partycrm_provider_storage_unavailable' })
const encryptionKey = (secret = process.env.PARTYCRM_PROVIDER_ENCRYPTION_KEY) => {
  if (typeof secret !== 'string') throw unavailable()
  const key = /^[a-f\d]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : /^[A-Za-z\d+/]{43}=$/.test(secret) ? Buffer.from(secret, 'base64') : null
  if (!key || key.length !== 32) throw unavailable()
  return key
}
const aad = (tenantId, provider) => Buffer.from(`partycrm:ticket-provider:v1:${tenantId}:${provider}`)

export const isPartyProviderEncryptionReady = (secret) => {
  try { encryptionKey(secret); return true } catch { return false }
}
export const encryptPartyProviderToken = (token, { tenantId, provider, secret } = {}) => {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  cipher.setAAD(aad(tenantId, provider))
  const value = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: value.toString('base64') }
}
export const decryptPartyProviderToken = (envelope, { tenantId, provider, secret } = {}) => {
  try {
    if (envelope?.version !== 1) throw unavailable()
    const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64')
    if (iv.length !== 12 || tag.length !== 16) throw unavailable()
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv)
    decipher.setAAD(aad(tenantId, provider)); decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(envelope.value, 'base64')), decipher.final()]).toString('utf8')
  } catch { throw unavailable() }
}
