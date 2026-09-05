import crypto from 'node:crypto'
import { getPartyOrderModel, getPartyStaffModel } from './partyModels'
import {
  getPartyFinancialOperationModel,
  getPartyFinancialSettlementModel,
  getPartyMoneyTaskModel,
} from './partyFinancialModels'
import {
  isFinancialManager,
  withPartyFinancialTransaction,
} from './partyFinancialSettlements'
import {
  calculateCustodyBalance,
  normalizeMoneyTask,
  normalizeMoneyTaskSubmission,
  resolveMoneyTaskReview,
} from '@helpers/partyMoneyTasks'
import { financialError, financialId } from '@helpers/partyFinancialSettlements'

export const assertMoneyTaskAccess = (
  task,
  context,
  managementOnly = false
) => {
  if (!task || financialId(task.tenantId) !== financialId(context.tenantId))
    throw financialError('Денежное поручение не найдено', 404)
  if (
    (managementOnly ||
      financialId(task.responsibleStaffId) !==
        financialId(context.staff?._id)) &&
    !isFinancialManager(context)
  )
    throw financialError('Недостаточно прав для поручения', 403)
}

export const createPartyMoneyTask = async ({ context, body }) => {
  if (!isFinancialManager(context))
    throw financialError(
      'Создавать денежные поручения может только руководитель',
      403
    )
  const value = normalizeMoneyTask(body)
  const [Orders, Staff, Settlements, Tasks] = await Promise.all([
    getPartyOrderModel(),
    getPartyStaffModel(),
    getPartyFinancialSettlementModel(),
    getPartyMoneyTaskModel(),
  ])
  await Tasks.init()
  const createPayloadHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        ...value,
        dueAt: value.dueAt.toISOString(),
        settlementId: value.settlementId || null,
      })
    )
    .digest('hex')
  const repeated = await Tasks.findOne({
    tenantId: context.tenantId,
    idempotencyKey: value.idempotencyKey,
  }).lean()
  if (repeated) {
    if (repeated.createPayloadHash !== createPayloadHash)
      throw financialError(
        'Идентификатор уже использован для другого поручения',
        409
      )
    return { task: repeated, repeated: true }
  }
  const [order, staff] = await Promise.all([
    Orders.findOne({
      tenantId: context.tenantId,
      _id: value.orderId,
      status: { $ne: 'canceled' },
    }).lean(),
    Staff.find({
      tenantId: context.tenantId,
      _id: { $in: [value.staffId, value.responsibleStaffId] },
      status: 'active',
    }).lean(),
  ])
  if (
    !order ||
    staff.length !== new Set([value.staffId, value.responsibleStaffId]).size
  )
    throw financialError('Заказ или активный сотрудник не найден', 404)
  if (
    !(order.assignedStaff || []).some(
      (assignment) =>
        financialId(assignment.staffId) === value.responsibleStaffId
    )
  )
    throw financialError(
      'Денежное поручение можно назначить только участнику заказа',
      409
    )
  if (
    value.settlementId &&
    !(await Settlements.exists({
      tenantId: context.tenantId,
      _id: value.settlementId,
      orderId: value.orderId,
      staffId: value.staffId,
    }))
  )
    throw financialError(
      'Финансовая сверка не относится к этому заказу и сотруднику',
      404
    )
  try {
    return {
      task: await Tasks.create({
        ...value,
        tenantId: context.tenantId,
        createPayloadHash,
      }),
      repeated: false,
    }
  } catch (error) {
    if (error.code !== 11000) throw error
    const concurrent = await Tasks.findOne({
      tenantId: context.tenantId,
      idempotencyKey: value.idempotencyKey,
    }).lean()
    if (concurrent?.createPayloadHash === createPayloadHash)
      return { task: concurrent, repeated: true }
    throw financialError(
      'Идентификатор уже использован для другого поручения',
      409
    )
  }
}

export const submitPartyMoneyTask = async ({ context, id, body }) => {
  const revision = Number(body.revision)
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw financialError('Укажите актуальную ревизию поручения')
  const Tasks = await getPartyMoneyTaskModel()
  const current = await Tasks.findOne({
    tenantId: context.tenantId,
    _id: id,
  }).lean()
  assertMoneyTaskAccess(current, context)
  if (current.status !== 'pending' || current.revision !== revision)
    throw financialError('Поручение уже изменено; обновите данные', 409)
  const submission = normalizeMoneyTaskSubmission(body)
  const task = await Tasks.findOneAndUpdate(
    { tenantId: context.tenantId, _id: id, status: 'pending', revision },
    {
      $set: {
        ...submission,
        status: 'submitted',
        submittedAt: new Date(),
        submittedByStaffId: context.staff._id,
        reviewComment: '',
      },
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true }
  ).lean()
  if (!task)
    throw financialError('Поручение уже изменено; обновите данные', 409)
  return task
}

export const reviewPartyMoneyTask = async ({ context, id, body }) => {
  if (!isFinancialManager(context))
    throw financialError('Проверять поручение может только руководитель', 403)
  const revision = Number(body.revision)
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw financialError('Укажите актуальную ревизию поручения')
  const Tasks = await getPartyMoneyTaskModel()
  const task = await Tasks.findOne({
    tenantId: context.tenantId,
    _id: id,
  }).lean()
  assertMoneyTaskAccess(task, context, true)
  const transition =
    task.status === 'completed' && body.action === 'approve_completion'
      ? null
      : resolveMoneyTaskReview({
          task,
          action: body.action,
          revision,
          comment: body.comment,
        })
  if (body.action === 'request_revision') {
    const updated = await Tasks.findOneAndUpdate(
      {
        tenantId: context.tenantId,
        _id: id,
        status: transition.expectedStatus,
        revision,
      },
      { $set: transition.patch, $inc: { revision: 1 } },
      { new: true }
    ).lean()
    if (!updated)
      throw financialError('Поручение уже изменено; обновите данные', 409)
    return { task: updated, repeated: false }
  }
  if (body.action === 'cancel') {
    const updated = await Tasks.findOneAndUpdate(
      {
        tenantId: context.tenantId,
        _id: id,
        status: transition.expectedStatus,
        revision,
      },
      {
        $set: {
          ...transition.patch,
          canceledAt: new Date(),
          canceledByStaffId: context.staff._id,
        },
        $inc: { revision: 1 },
      },
      { new: true }
    ).lean()
    if (!updated)
      throw financialError('Поручение уже изменено; обновите данные', 409)
    return { task: updated, repeated: false }
  }
  if (body.action !== 'approve_completion')
    throw financialError('Некорректное действие')
  const idempotencyKey = String(body.idempotencyKey || '')
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey))
    throw financialError('Некорректный идентификатор операции')
  const Operations = await getPartyFinancialOperationModel()
  await Operations.init()
  return withPartyFinancialTransaction(context.tenantId, async (session) => {
    const current = await Tasks.findOne({ tenantId: context.tenantId, _id: id })
      .session(session)
      .lean()
    assertMoneyTaskAccess(current, context, true)
    const operationType =
      current.type === 'receive_from_client'
        ? 'custody_received_from_client'
        : 'custody_transferred_to_company'
    const hash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          taskId: id,
          operationType,
          amountKopecks: current.submittedAmountKopecks,
        })
      )
      .digest('hex')
    if (current.status === 'completed') {
      const operation = await Operations.findOne({
        tenantId: context.tenantId,
        _id: current.completedOperationId,
      })
        .session(session)
        .lean()
      if (
        operation?.idempotencyKey === idempotencyKey &&
        operation.payloadHash === hash
      )
        return { task: current, operation, repeated: true }
      throw financialError('Поручение уже проведено', 409)
    }
    if (current.status !== 'submitted' || current.revision !== revision)
      throw financialError('Поручение уже изменено; обновите данные', 409)
    const collision = await Operations.findOne({
      tenantId: context.tenantId,
      idempotencyKey,
    })
      .session(session)
      .lean()
    if (collision)
      throw financialError(
        collision.payloadHash === hash
          ? 'Операция уже существует, но поручение не завершено'
          : 'Идентификатор уже использован для другой денежной операции',
        409
      )
    if (operationType === 'custody_transferred_to_company') {
      const custody = await Operations.find({
        tenantId: context.tenantId,
        orderId: current.orderId,
        staffId: current.staffId,
        type: {
          $in: [
            'custody_received_from_client',
            'custody_transferred_to_company',
            'received_on_site',
          ],
        },
      })
        .session(session)
        .lean()
      const Settlements = await getPartyFinancialSettlementModel()
      const settlement = await Settlements.findOne({
        tenantId: context.tenantId,
        orderId: current.orderId,
        staffId: current.staffId,
      })
        .session(session)
        .select('importedReceivedOnSiteKopecks')
        .lean()
      const available = calculateCustodyBalance(custody, {
        ...current,
        retainedKopecks: settlement?.importedReceivedOnSiteKopecks || 0,
      })
      if (current.submittedAmountKopecks > available)
        throw financialError(
          `У сотрудника учтено ${available} коп.; нельзя передать ${current.submittedAmountKopecks} коп.`,
          409
        )
    }
    const [operation] = await Operations.create(
      [
        {
          tenantId: context.tenantId,
          moneyTaskId: id,
          settlementId: current.settlementId,
          orderId: current.orderId,
          staffId: current.staffId,
          type: operationType,
          amountKopecks: current.submittedAmountKopecks,
          comment: current.submissionComment,
          idempotencyKey,
          payloadHash: hash,
          createdByStaffId: context.staff._id,
        },
      ],
      { session }
    )
    const completed = await Tasks.findOneAndUpdate(
      { tenantId: context.tenantId, _id: id, status: 'submitted', revision },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          completedByStaffId: context.staff._id,
          completedOperationId: operation._id,
        },
        $inc: { revision: 1 },
      },
      { new: true, session }
    ).lean()
    if (!completed)
      throw financialError('Поручение уже изменено; операция отменена', 409)
    return { task: completed, operation: operation.toObject(), repeated: false }
  })
}
