import { NextResponse } from 'next/server'
import { getPartySessionUser } from './partyAuth'

export const getPartySiteSettingsDevUser = async () => {
  const user = await getPartySessionUser()
  if (!user?._id) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      ),
    }
  }
  if (user.role !== 'dev') {
    return {
      user,
      error: NextResponse.json(
        { success: false, error: 'Раздел доступен только dev' },
        { status: 403 }
      ),
    }
  }
  return { user, error: null }
}
