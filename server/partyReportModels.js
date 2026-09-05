import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import partyReportsSchema, { partyReportTemplatesSchema, partyReportMediaSchema, partyReportRevisionSchema } from '@schemas/partyReportsSchema'
import partyReportReconciliationsSchema, { partyReportReconciliationRevisionSchema } from '@schemas/partyReportReconciliationsSchema'

export const getPartyReportTemplateModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ReportTemplate', collectionName: 'reportTemplates',
  schemaDefinition: partyReportTemplatesSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => {
    schema.index({ tenantId: 1, familyId: 1, version: 1 }, { unique: true })
  },
})

export const getPartyReportModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'Report', collectionName: 'reports',
  schemaDefinition: partyReportsSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => {
    schema.index({ tenantId: 1, orderId: 1, staffId: 1, templateFamilyId: 1 }, { unique: true })
    schema.index({ tenantId: 1, 'templateSnapshot.fields.reviewerStaffId': 1 })
  },
})

export const getPartyReportMediaModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ReportMedia', collectionName: 'reportMedia',
  schemaDefinition: partyReportMediaSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, reportId: 1, fieldId: 1 }),
})

export const getPartyReportRevisionModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ReportRevision', collectionName: 'reportRevisions',
  schemaDefinition: partyReportRevisionSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, reportId: 1, revision: 1 }, { unique: true }),
})

export const getPartyReportReconciliationModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ReportReconciliation', collectionName: 'reportReconciliations',
  schemaDefinition: partyReportReconciliationsSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => {
    schema.index({ tenantId: 1, reportId: 1 }, { unique: true })
    schema.index({ tenantId: 1, orderId: 1, staffId: 1, status: 1 })
  },
})

export const getPartyReportReconciliationRevisionModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ReportReconciliationRevision', collectionName: 'reportReconciliationRevisions',
  schemaDefinition: partyReportReconciliationRevisionSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, reconciliationId: 1, revision: 1 }, { unique: true }),
})
