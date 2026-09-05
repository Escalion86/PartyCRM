import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import settlements from '@schemas/partyFinancialSettlementsSchema'
import operations from '@schemas/partyFinancialOperationsSchema'
import statements from '@schemas/partyPayrollStatementsSchema'
import moneyTasks from '@schemas/partyMoneyTasksSchema'

const model = (name, collectionName, schemaDefinition, configureSchema) =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name,
    collectionName,
    schemaDefinition,
    schemaOptions: { timestamps: true },
    configureSchema,
  })
export const getPartyFinancialSettlementModel = () =>
  model(
    'FinancialSettlement',
    'financialsettlements',
    settlements,
    (schema) => {
      schema.index({ tenantId: 1, orderId: 1, staffId: 1 }, { unique: true })
      schema.index({ tenantId: 1, periodKey: 1, status: 1 })
      schema.index(
        { tenantId: 1, sourceReportReconciliationId: 1 },
        {
          unique: true,
          partialFilterExpression: {
            sourceReportReconciliationId: { $type: 'objectId' },
          },
        }
      )
    }
  )
export const getPartyFinancialOperationModel = () =>
  model('FinancialOperation', 'financialoperations', operations, (schema) => {
    schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
    schema.index({ tenantId: 1, settlementId: 1, createdAt: 1 })
    schema.index(
      { tenantId: 1, moneyTaskId: 1 },
      {
        unique: true,
        partialFilterExpression: { moneyTaskId: { $type: 'objectId' } },
      }
    )
  })
export const getPartyPayrollStatementModel = () =>
  model('PayrollStatement', 'payrollstatements', statements, (schema) =>
    schema.index({ tenantId: 1, periodKey: 1 }, { unique: true })
  )
export const getPartyFinancialLockModel = () =>
  model(
    'FinancialLock',
    'financiallocks',
    {
      tenantId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, default: 0 },
    },
    (schema) => schema.index({ tenantId: 1 }, { unique: true })
  )

export const getPartyMoneyTaskModel = () =>
  model('MoneyTask', 'moneytasks', moneyTasks, (schema) => {
    schema.index({ tenantId: 1, responsibleStaffId: 1, status: 1, dueAt: 1 })
    schema.index({ tenantId: 1, orderId: 1, createdAt: -1 })
    schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
    schema.index(
      { tenantId: 1, completedOperationId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          completedOperationId: { $type: 'objectId' },
        },
      }
    )
  })
