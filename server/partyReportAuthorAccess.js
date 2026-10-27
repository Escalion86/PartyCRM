import { getPartyStaffModel, getPartyRoleModel } from './partyModels'
import {
  effectivePartyReportFields,
  effectivePartyReportStatus,
} from './partyReportCore'

export const loadPartyReportAuthorContexts = async (
  tenantId,
  staffIds,
  session
) => {
  const ids = [...new Set(staffIds.map(String))]
  if (!ids.length) return new Map()
  const [Staff, Roles] = await Promise.all([
    getPartyStaffModel(),
    getPartyRoleModel(),
  ])
  const peopleQuery = Staff.find({ tenantId, _id: { $in: ids } })
  const positionsQuery = Roles.find({ tenantId })
  const [people, positions] = session
    ? [
        await peopleQuery.session(session).lean(),
        await positionsQuery.session(session).lean(),
      ]
    : await Promise.all([peopleQuery.lean(), positionsQuery.lean()])
  return new Map(
    people.map((staff) => {
      const position = staff.positionId
        ? positions.find(
            (item) => String(item._id) === String(staff.positionId)
          )
        : positions.find((item) => item.systemKey === staff.role)
      return [
        String(staff._id),
        { tenantId, staff, role: staff.role, position: position || null },
      ]
    })
  )
}

export const partyReportWithEffectiveStatus = (
  report,
  authorContext,
  order
) => ({
  ...report,
  status: effectivePartyReportStatus(report, authorContext, order),
})

export const filterPartyReportTemplatesForAuthor = (
  templates,
  context,
  order
) =>
  templates
    .map((template) => ({
      ...template,
      fields: effectivePartyReportFields(context, template, order, 'edit'),
    }))
    .filter((template) => template.fields.length > 0)
