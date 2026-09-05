import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { resolvePartyRequestContext } from '@server/partyApiCore'
import { partyError } from '@server/partyApi'
import { getPartyReportModel, getPartyReportMediaModel } from '@server/partyReportModels'
import { reportId, loadReportOrder, isAssignedToReportOrder } from '@server/partyReportAccess'
import { canReadReportField, reportMediaIds, isReportAuthor, isReportManager } from '@server/partyReportCore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req, { params }) {
  try {
    const membershipContext = await getPartyMembershipContext({ excludeLocationOwners: true })
    if (!membershipContext.sessionUser?._id) return partyError(401, 'unauthorized', 'Не авторизован')
    const { id } = await params
    const Media = await getPartyReportMediaModel()
    // Metadata lookup reveals no response to the caller until tenant membership is checked.
    const media = await Media.findOne({ _id: reportId(id) }).lean()
    const denied = () => partyError(404, 'partycrm_media_not_found', 'Фотография не найдена')
    if (!media) return denied()
    const { context, error } = resolvePartyRequestContext({ membershipContext, requestedCompanyId: String(media.tenantId) })
    if (error) return denied()
    const Reports = await getPartyReportModel()
    const report = await Reports.findOne({ _id: media.reportId, tenantId: context.tenantId }).lean()
    if (!report) return denied()
    const order = await loadReportOrder(context.tenantId, String(report.orderId))
    const field = report.templateSnapshot.fields.find((item) => item.id === media.fieldId)
    if (!field || !canReadReportField(context, report, field, isAssignedToReportOrder(context, order))) return denied()
    const answer = report.answers.find((item) => item.fieldId === media.fieldId)
    // Only the author/management may preview uploads not yet included in an answer.
    if (!reportMediaIds(answer?.html).includes(String(media._id)) && !isReportAuthor(context, report) && !isReportManager(context)) return denied()
    const content = await Media.findOne({ _id: media._id, tenantId: context.tenantId }).select('+bytes').lean()
    const raw = content?.bytes
    const bytes = Buffer.isBuffer(raw) ? raw : raw?.value ? raw.value(true) : raw?.buffer
    if (!bytes) return denied()
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': media.mimeType,
        'Content-Length': String(media.size),
        'Content-Disposition': 'inline; filename="report-photo.webp"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch (error) {
    return partyError(error.status || 500, 'partycrm_media_failed', error.status ? error.message : 'Не удалось загрузить фотографию')
  }
}
