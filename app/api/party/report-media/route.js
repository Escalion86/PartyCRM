import sharp from 'sharp'
import { getPartyReportModel, getPartyReportMediaModel } from '@server/partyReportModels'
import { withReportContext, reportId, reportJson, loadReportOrder, requireReportAuthorAssignment } from '@server/partyReportAccess'
import { reportFailure } from '@server/partyReportCore'

export const runtime = 'nodejs'

export const POST = withReportContext(async (req, context) => {
  const maxBytes = 10 * 1024 * 1024
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > maxBytes + 65536) reportFailure('Фотография должна быть меньше 10 МБ', 413)
  if (!req.body) reportFailure('Выберите фотографию')
  // Enforce the limit even for chunked requests without Content-Length.
  const reader = req.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes + 65536) {
      await reader.cancel()
      reportFailure('Фотография должна быть меньше 10 МБ', 413)
    }
    chunks.push(Buffer.from(value))
  }
  const data = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers.get('content-type') || '' } }).formData()
  const Reports = await getPartyReportModel()
  const report = await Reports.findOne({ _id: reportId(data.get('reportId')), tenantId: context.tenantId }).lean()
  if (!report) reportFailure('Отчёт не найден', 404)
  const order = await loadReportOrder(context.tenantId, String(report.orderId))
  requireReportAuthorAssignment(context, order, report.staffId)
  const fieldId = data.get('fieldId')
  const answer = report.answers.find((item) => item.fieldId === fieldId)
  if (!answer || !['draft', 'revision_requested'].includes(answer.status)) reportFailure('Поле недоступно для изменения', 409)
  const file = data.get('file')
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size || file.size > maxBytes) reportFailure('Выберите фотографию размером до 10 МБ', 413)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) reportFailure('Допустимы фотографии JPEG, PNG и WebP')
  let bytes
  try {
    const input = Buffer.from(await file.arrayBuffer())
    const pipeline = sharp(input, { limitInputPixels: 40000000, animated: false })
    const metadata = await pipeline.metadata()
    const formatMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
    if (formatMime[metadata.format] !== file.type || (metadata.pages || 1) > 1) reportFailure('Формат содержимого не соответствует фотографии')
    // Re-encode to remove EXIF/GPS, embedded payloads and normalize phone photos.
    bytes = await pipeline.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
  } catch (error) {
    if (error.status) throw error
    reportFailure('Не удалось прочитать фотографию')
  }
  const Media = await getPartyReportMediaModel()
  if (await Media.countDocuments({ tenantId: context.tenantId, reportId: report._id, fieldId }) >= 40) reportFailure('Достигнут лимит: 40 фотографий на поле')
  const media = await Media.create({ tenantId: context.tenantId, reportId: report._id, fieldId, mimeType: 'image/webp', size: bytes.length, bytes })
  return reportJson({ id: String(media._id), url: `/api/party/report-media/${media._id}` })
})
