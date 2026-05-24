import { getServerSession } from 'next-auth'
import mongoose from 'mongoose'
import authOptions from '../app/api/auth/[...nextauth]/_options'
import dbConnect from './dbConnect'
import Users from '@models/Users'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const getTenantContext = async () => {
  const session = await getServerSession(authOptions)
  let user = session?.user ?? null

  if (user?._id) {
    try {
      await dbConnect()
      const dbUser = await Users.findById(user._id).lean()
      if (dbUser) {
        const { password, ...safeUser } = dbUser
        user = { ...user, ...safeUser }
      } else {
        let matchesByPhone = null
        if (user.phone) {
          const normalizedPhone = normalizePhone(user.phone)
          const phoneAsNumber = Number(normalizedPhone)
          const phoneQuery = Number.isNaN(phoneAsNumber)
            ? { phone: normalizedPhone }
            : { $or: [{ phone: normalizedPhone }, { phone: phoneAsNumber }] }
          matchesByPhone = await Users.find(phoneQuery)
            .select('_id phone email')
            .lean()
        }
        console.warn('getTenantContext: пользователь из сессии не найден', {
          sessionUserId: user._id,
          sessionPhone: user.phone ?? null,
          sessionTenantId: user.tenantId ?? null,
          matchesByPhone: matchesByPhone?.map((item) => ({
            _id: item._id,
            phone: item.phone ?? null,
            email: item.email ?? null,
          })) ?? null,
        })
        user = null
      }
    } catch (error) {
      console.error('getTenantContext: не удалось загрузить пользователя', error)
    }
  }

  const rawTenantId = user?.tenantId || user?._id || null
  const tenantId =
    rawTenantId && mongoose.Types.ObjectId.isValid(String(rawTenantId))
      ? String(rawTenantId)
      : null

  return { session, user, tenantId }
}

export default getTenantContext
