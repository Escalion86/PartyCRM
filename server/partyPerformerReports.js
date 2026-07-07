const REPORT_STATUSES = new Set([
  'draft',
  'submitted',
  'accepted',
  'revision_requested',
])

export const normalizePartyPerformerReportFiles = (files = []) =>
  (Array.isArray(files) ? files : [])
    .map((file) => ({
      name: String(file?.name || '').trim().slice(0, 240),
      url: String(file?.url || '').trim().slice(0, 1000),
      comment: String(file?.comment || '').trim().slice(0, 500),
    }))
    .filter((file) => file.name || file.url)
    .slice(0, 10)

export const normalizePartyPerformerReportPayload = (body = {}) => {
  const status = REPORT_STATUSES.has(body.status) ? body.status : 'submitted'
  return {
    status,
    text: String(body.text || '').trim().slice(0, 4000),
    files: normalizePartyPerformerReportFiles(body.files),
    submittedAt: status === 'submitted' ? new Date() : null,
    reviewedAt: null,
    reviewedByStaffId: null,
    reviewComment: '',
  }
}

export const normalizePartyPerformerReportReview = (body = {}) => ({
  status:
    body.status === 'revision_requested' ? 'revision_requested' : 'accepted',
  reviewComment: String(body.reviewComment || '').trim().slice(0, 1000),
  reviewedAt: new Date(),
})
