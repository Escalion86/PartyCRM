/* eslint-disable @next/next/no-img-element */
'use client'

import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import UserName from '@components/UserName'
import getUserAvatarSrc from '@helpers/getUserAvatarSrc'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import userSelector from '@state/selectors/userSelector'
import { useAtomValue } from 'jotai'
import tariffsAtom from '@state/atoms/tariffsAtom'
import formatDate from '@helpers/formatDate'
import CardWrapper from '@components/CardWrapper'
import { useEventsQuery } from '@helpers/useEventsQuery'

const UserCard = ({ userId, hidden = false, style }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const user = useAtomValue(userSelector(userId))
  const loading = useAtomValue(loadingAtom('user' + userId))
  const error = useAtomValue(errorAtom('user' + userId))
  const tariffs = useAtomValue(tariffsAtom)
  const { data: eventsPayload } = useEventsQuery({
    scope: 'all',
    enabled: false,
  })
  const events = eventsPayload?.data ?? []
  // const widthNum = useWindowDimensionsTailwindNum()
  // const itemFunc = useAtomValue(itemsFuncAtom)

  // const userStatusArr = USERS_STATUSES.find(
  //   (userStatus) => userStatus.value === user.status
  // )

  const tariffTitle = (() => {
    if (!user?.tariffId) return 'Не выбран'
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(user.tariffId)
    )
    return tariff?.title || 'Не выбран'
  })()

  const tariffPaidUntil = (() => {
    if (!user?.tariffActiveUntil) return null
    const date = new Date(user.tariffActiveUntil)
    if (Number.isNaN(date.getTime())) return null
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  })()

  const formattedBalance = (() => {
    const value = Number(user?.balance ?? 0)
    if (!Number.isFinite(value)) return '0'
    return value.toLocaleString('ru-RU')
  })()

  const eventsCount = (() => {
    if (!user?._id) return 0
    return (events ?? []).filter(
      (item) => String(item?.tenantId) === String(user._id)
    ).length
  })()

  const requestsCount = (() => {
    if (!user?._id) return 0
    return (events ?? []).filter(
      (item) =>
        String(item?.tenantId) === String(user._id) && item?.status === 'draft'
    ).length
  })()

  const registrationLabel = user?.createdAt
    ? formatDate(user.createdAt, false, true)
    : 'Не указана'

  if (!user) return null

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && modalsFunc.user.view(user._id)}
      className="card-body-pad flex h-full w-full cursor-pointer p-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} rounded />
      <CardActions>
        <CardButtons
          item={user}
          typeOfItem="user"
          minimalActions
          alwaysCompact
        />
      </CardActions>
      <div className="flex h-full w-full gap-3">
        <img
          className="h-16 w-16 min-w-[64px] rounded-lg object-cover"
          src={getUserAvatarSrc(user)}
          alt="user"
        />
        <div className="relative flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <UserName
              user={user}
              className="card-title text-base"
            />
          </div>
          <div className="card-meta text-xs font-semibold">
            Тариф: {tariffTitle}
            {tariffPaidUntil ? ` (${tariffPaidUntil})` : ''}
          </div>
          <div className="card-meta text-xs font-semibold">
            Баланс: {formattedBalance} руб.
          </div>
          <div className="card-meta text-xs font-semibold">
            Создано мероприятий: {eventsCount}
          </div>
          <div className="card-meta text-xs font-semibold">
            Создано заявок: {requestsCount}
          </div>
          <div className="card-meta text-xs font-semibold">
            Дата регистрации: {registrationLabel}
          </div>
          <div className="mt-auto flex justify-end sm:absolute sm:right-0 sm:bottom-0">
            <ContactsIconsButtons user={user} className="justify-end" />
          </div>
        </div>
      </div>
    </CardWrapper>
  )
}

export default UserCard

