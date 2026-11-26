import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import sharp from 'sharp'
import { uploadPartyCompanyLogo } from './partyCompanyLogoUpload.js'
import { PARTY_COMPANY_LOGO_MAX_BYTES } from '../helpers/partyCompanyLogoUpload.js'

const tenantId = 'a'.repeat(24)
const password = 'local-test-password'
const image = () => sharp({ create: { width: 8, height: 6, channels: 4, background: '#12345680' } }).png().toBuffer()
const request = (bytes, { type = 'image/png', filename = 'logo.png', extra = false } = {}) => {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), filename)
  if (extra) form.append('directory', 'other-company')
  return new Request('http://localhost/api/party/company-settings/logo', { method: 'POST', body: form })
}

test('logo upload reencodes content and scopes the cloud path and returned URL to the authorized company', async () => {
  let uploads = 0
  const result = await uploadPartyCompanyLogo({
    tenantId, password, req: request(await image()),
    fetchImpl: async (url, options) => {
      uploads++
      assert.equal(url, 'https://cloud.escalion.ru/api')
      assert.equal(options.method, 'POST')
      assert.equal(options.redirect, 'error')
      assert.equal(options.headers['x-api-password'], password)
      assert.ok(options.signal instanceof AbortSignal)
      const form = options.body
      const directory = form.get('directory')
      assert.equal(directory, `partycrm/companies/${tenantId}/branding`)
      assert.match(form.get('fileName'), /^[a-f\d-]{36}$/i)
      assert.equal(form.get('extension'), 'webp')
      const file = form.get('files')
      assert.equal(file.type, 'image/webp')
      assert.equal(file.name, `${form.get('fileName')}.webp`)
      const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.hasAlpha, true)
      assert.equal(metadata.width, 8)
      assert.equal(metadata.exif, undefined)
      return Response.json([`https://cloud.escalion.ru/uploads/${directory}/${file.name}`])
    },
  })
  assert.equal(uploads, 1)
  assert.match(result.logoUrl, new RegExp(`^https://cloud\\.escalion\\.ru/uploads/partycrm/companies/${tenantId}/branding/[a-f\\d-]{36}\\.webp$`))
})

test('invalid content, spoofed MIME, extra multipart fields and excessive size never reach the cloud', async () => {
  const png = await image()
  let uploads = 0
  const fetchImpl = async () => { uploads++; throw new Error('Should not upload') }
  for (const req of [
    request(Buffer.from('not an image')),
    request(png, { type: 'image/jpeg' }),
    request(png, { type: 'image/svg+xml' }),
    request(png, { extra: true }),
    request(Buffer.alloc(PARTY_COMPANY_LOGO_MAX_BYTES + 1)),
  ]) {
    await assert.rejects(uploadPartyCompanyLogo({ req, tenantId, password, fetchImpl }), (error) => [400, 413].includes(error.status))
  }
  assert.equal(uploads, 0)
})

test('a streamed request without Content-Length cannot exceed the multipart limit', async () => {
  let cancelled = false
  const req = {
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=large-upload' }),
    body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(PARTY_COMPANY_LOGO_MAX_BYTES + 65537)) },
      cancel() { cancelled = true },
    }),
  }
  await assert.rejects(uploadPartyCompanyLogo({ req, tenantId, password }), (error) => error.status === 413)
  assert.equal(cancelled, true)
})

test('malicious cloud URLs and upstream failures return a generic error without secrets', async () => {
  const png = await image()
  for (const response of [
    ['https://foreign.example/logo.webp'],
    [`https://cloud.escalion.ru/uploads/partycrm/companies/${'b'.repeat(24)}/branding/logo.webp`],
    [`https://cloud.escalion.ru/uploads/partycrm/companies/${tenantId}/branding/logo.webp?token=${password}`],
    { urls: [`https://cloud.escalion.ru/${password}`] },
  ]) {
    await assert.rejects(uploadPartyCompanyLogo({ tenantId, password, req: request(png), fetchImpl: async () => Response.json(response) }), (error) => error.status === 502 && !error.message.includes(password))
  }
  await assert.rejects(uploadPartyCompanyLogo({ tenantId, password, req: request(png), fetchImpl: async () => { throw new Error(password) } }), (error) => error.status === 502 && !error.message.includes(password))
  await assert.rejects(uploadPartyCompanyLogo({ tenantId, password, req: request(png), fetchImpl: async () => new Response(password, { status: 401 }) }), (error) => error.status === 502 && !error.message.includes(password))
  await assert.rejects(uploadPartyCompanyLogo({ tenantId, password: '', req: request(png) }), (error) => error.status === 503)
})

test('the logo route authorizes company management before reading the file and forwards the context tenant', async () => {
  const source = (await readFile(new URL('../app/api/party/company-settings/logo/route.js', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/gm, '')
    .replace(/^export /gm, '')
  let denied = true
  let uploadArgs = null
  const req = { headers: { get: () => 'untrusted-company' } }
  const dependencies = {
    NextResponse: { json: (body, options) => ({ body, options }) },
    getPartyRequestContext: async (options) => {
      assert.deepEqual(options, { req, managementOnly: true })
      return denied ? { error: { status: 403 } } : { context: { tenantId } }
    },
    partyError: (status, code, message) => ({ status, code, message }),
    uploadPartyCompanyLogo: async (args) => { uploadArgs = args; return { logoUrl: 'https://cloud.escalion.ru/uploads/logo.webp' } },
  }
  const POST = compileFunction(`${source}\nreturn POST`, Object.keys(dependencies))(...Object.values(dependencies))
  assert.deepEqual(await POST(req), { status: 403 })
  assert.equal(uploadArgs, null)
  denied = false
  const result = await POST(req)
  assert.deepEqual(uploadArgs, { req, tenantId })
  assert.equal(result.body.success, true)
  assert.equal(result.options.headers['Cache-Control'], 'private, no-store')
})
