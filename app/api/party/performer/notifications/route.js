import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'

const serializeNotifications = (user) => ({
  pushEnabled:
    user?.performerSettings?.notifications?.pushEnabled === false
      ? false
      : true,
})

const getAuthorizedPerformerContext = async () => {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      ),
    }
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUsePerformer) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Кабинет исполнителя недоступен' },
        { status: 403 }
      ),
    }
  }

  return { sessionUser }
}

export async function GET() {
  const { sessionUser, error } = await getAuthorizedPerformerContext()
  if (error) return error

  const PartyUsers = await getPartyUserModel()
  const user = await PartyUsers.findById(sessionUser._id)
    .select('performerSettings.notifications')
    .lean()

  return NextResponse.json({
    success: true,
    data: {
      notifications: serializeNotifications(user),
    },
  })
}

export async function PATCH(req) {
  const { sessionUser, error } = await getAuthorizedPerformerContext()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const notifications =
    body?.notifications && typeof body.notifications === 'object'
      ? body.notifications
      : {}
  const update = {}

  if (Object.prototype.hasOwnProperty.call(notifications, 'pushEnabled')) {
    update['performerSettings.notifications.pushEnabled'] =
      notifications.pushEnabled === true
  }

  const PartyUsers = await getPartyUserModel()
  if (Object.keys(update).length > 0) {
    await PartyUsers.updateOne(
      { _id: sessionUser._id },
      {
        $set: update,
      }
    )
  }

  const user = await PartyUsers.findById(sessionUser._id)
    .select('performerSettings.notifications')
    .lean()

  return NextResponse.json({
    success: true,
    data: {
      notifications: serializeNotifications(user),
    },
  })
}
