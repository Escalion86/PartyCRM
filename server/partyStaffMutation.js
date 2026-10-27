import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import { getPartyStaffModel } from './partyModels'

export const getPartyStaffMutationLockModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'StaffMutationLock',
    collectionName: 'staffMutationLocks',
    schemaDefinition: {
      tenantId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, default: 0 },
    },
    schemaOptions: { timestamps: true },
    configureSchema: (schema) =>
      schema.index({ tenantId: 1 }, { unique: true }),
  })

export const createPartyStaffMutationLock =
  ({
    getLock = getPartyStaffMutationLockModel,
    getStaff = getPartyStaffModel,
  } = {}) =>
  async ({ context, work }) => {
    const Lock = await getLock()
    const Staff = await getStaff()
    await Lock.init()
    try {
      await Lock.updateOne(
        { tenantId: context.tenantId },
        { $setOnInsert: { tenantId: context.tenantId, revision: 0 } },
        { upsert: true }
      )
    } catch (error) {
      if (error.code !== 11000) throw error
    }
    const session = await Lock.db.startSession()
    try {
      return await session.withTransaction(async () => {
        await Lock.updateOne(
          { tenantId: context.tenantId },
          { $inc: { revision: 1 } },
          { session }
        )
        const developer =
          context.staff?.isDeveloperAccess === true &&
          context.sessionUser?.role === 'dev'
        if (!developer) {
          const actor = await Staff.findOne({
            _id: context.staff?._id,
            tenantId: context.tenantId,
            status: 'active',
          })
            .session(session)
            .lean()
          if (
            !actor ||
            actor.role !== context.role ||
            String(actor.positionId || '') !==
              String(context.staff?.positionId || '')
          ) {
            throw Object.assign(
              new Error('Ваши полномочия изменились. Обновите кабинет.'),
              { status: 403, code: 'partycrm_membership_changed' }
            )
          }
        }
        return work({ session, Staff })
      })
    } finally {
      await session.endSession()
    }
  }

export const withPartyStaffMutationLock = createPartyStaffMutationLock()
