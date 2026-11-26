import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import {
  PARTY_COMPANY_LOGO_MAX_BYTES,
  getPartyCompanyLogoFileError,
} from '../helpers/partyCompanyLogoUpload.js'

const cloudOrigin = 'https://cloud.escalion.ru'
const maxRequestBytes = PARTY_COMPANY_LOGO_MAX_BYTES + 65536
const mimeByFormat = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code })
}

async function readLogoFile(req) {
  const contentType = req.headers.get('content-type') || ''
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !req.body) {
    fail(400, 'partycrm_logo_file_required', 'Выберите логотип в формате PNG, JPEG или WebP')
  }
  if (Number(req.headers.get('content-length') || 0) > maxRequestBytes) {
    fail(413, 'partycrm_logo_too_large', 'Логотип должен быть размером до 5 МБ')
  }

  const reader = req.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxRequestBytes) {
        await reader.cancel().catch(() => {})
        fail(413, 'partycrm_logo_too_large', 'Логотип должен быть размером до 5 МБ')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }

  let form
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': contentType },
    }).formData()
  } catch {
    fail(400, 'partycrm_logo_invalid_form', 'Не удалось прочитать файл логотипа')
  }
  const entries = [...form.entries()]
  if (entries.length !== 1 || entries[0][0] !== 'file') {
    fail(400, 'partycrm_logo_file_required', 'Выберите один файл логотипа')
  }
  const file = entries[0][1]
  const fileError = getPartyCompanyLogoFileError(file)
  if (fileError) {
    fail(file?.size > PARTY_COMPANY_LOGO_MAX_BYTES ? 413 : 400, 'partycrm_logo_invalid_file', fileError)
  }
  return file
}

async function encodeLogo(file) {
  try {
    const input = Buffer.from(await file.arrayBuffer())
    const pipeline = sharp(input, { limitInputPixels: 40000000, animated: false })
    const metadata = await pipeline.metadata()
    if (mimeByFormat[metadata.format] !== file.type || (metadata.pages || 1) > 1) {
      fail(400, 'partycrm_logo_invalid_image', 'Выберите обычное изображение PNG, JPEG или WebP без анимации')
    }
    return await pipeline
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()
  } catch (cause) {
    if (cause.code === 'partycrm_logo_invalid_image') throw cause
    fail(400, 'partycrm_logo_invalid_image', 'Не удалось прочитать изображение логотипа')
  }
}

export async function uploadPartyCompanyLogo({ req, tenantId, password = process.env.ESCALIONCLOUD_PASSWORD, fetchImpl = fetch }) {
  if (!/^[a-f\d]{24}$/i.test(String(tenantId))) {
    fail(400, 'partycrm_logo_invalid_company', 'Выберите компанию для загрузки логотипа')
  }
  if (!password) {
    fail(503, 'partycrm_logo_upload_unavailable', 'Загрузка логотипа временно недоступна')
  }
  const file = await readLogoFile(req)
  const bytes = await encodeLogo(file)
  const directory = `partycrm/companies/${String(tenantId)}/branding`
  const fileName = randomUUID()
  const form = new FormData()
  form.append('files', new Blob([bytes], { type: 'image/webp' }), `${fileName}.webp`)
  form.append('directory', directory)
  form.append('fileName', fileName)
  form.append('extension', 'webp')

  try {
    const response = await fetchImpl(`${cloudOrigin}/api`, {
      method: 'POST',
      headers: { 'x-api-password': password },
      body: form,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error('Upload failed')
    const urls = await response.json()
    if (!Array.isArray(urls) || urls.length !== 1 || typeof urls[0] !== 'string') throw new Error('Invalid upload response')
    const url = new URL(urls[0])
    if (url.origin !== cloudOrigin || url.username || url.password || url.search || url.hash ||
      url.pathname !== `/uploads/${directory}/${fileName}.webp`) {
      throw new Error('Invalid upload URL')
    }
    return { logoUrl: url.href }
  } catch {
    fail(502, 'partycrm_logo_upload_failed', 'Не удалось загрузить логотип. Попробуйте ещё раз.')
  }
}
