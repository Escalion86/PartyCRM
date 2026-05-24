import {
  // faHome,
  // faListAlt,
  faCircleExclamation,
  faSignInAlt,
  faSignOutAlt,
  faTags,
  faUserAlt,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import getParentDir from '@state/atoms/getParentDir'
import menuOpenAtom from '@state/atoms/menuOpen'
import cn from 'classnames'
import { motion } from 'framer-motion'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
// import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import Avatar from './Avatar'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { getNounDays } from '@helpers/getNoun'
import { modalsFuncAtom } from '@state/atoms'
import Button from '@components/Button'
import getPersonFullName from '@helpers/getPersonFullName'
// import { faCalendarAlt } from '@fortawesome/free-regular-svg-icons'

const variants = {
  show: {
    scale: 1,
    // width: 'auto',
    // height: 'auto',
    top: 0,
    right: 0,
    translateX: 0,
    translateY: 0,
  },
  hide: {
    scale: 0,
    top: 7,
    right: 7,
    // width: 0,
    // height: 0,
    translateX: '50%',
    translateY: '-50%',
  },
}

const MenuItem = ({ onClick, icon, title, href }) => {
  const Component = (
    <div
      onClick={onClick}
      className="flex items-center px-3 py-2 duration-300 bg-white border border-gray-300 cursor-pointer group gap-x-2 hover:bg-gray-500"
    >
      <FontAwesomeIcon
        icon={icon}
        className="w-5 h-5 text-general group-hover:text-white"
      />
      <span className="text-black prevent-select-text whitespace-nowrap group-hover:text-white">
        {title}
      </span>
    </div>
  )

  if (href)
    return (
      <Link href={href} shallow>
        {Component}
      </Link>
    )
  else return Component
}

const UserMenu = () => {
  const setMenuOpen = useSetAtom(menuOpenAtom)
  const [isUserMenuOpened, setIsUserMenuOpened] = useState(false)
  const [turnOnHandleMouseOver, setTurnOnHandleMouseOver] = useState(true)
  const [nowTs] = useState(() => Date.now())
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const selectedTariffTitle = useMemo(() => {
    if (!loggedUser?.tariffId) return 'Тариф не выбран'
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(loggedUser.tariffId)
    )
    return tariff?.title || 'Тариф не выбран'
  }, [loggedUser?.tariffId, tariffs])

  const selectedTariff = useMemo(() => {
    if (!loggedUser?.tariffId) return null
    return tariffs.find(
      (item) => String(item?._id) === String(loggedUser.tariffId)
    )
  }, [loggedUser?.tariffId, tariffs])

  const formattedBalance = useMemo(() => {
    const value = Number(loggedUser?.balance ?? 0)
    if (!Number.isFinite(value)) return '0'
    return value.toLocaleString('ru-RU')
  }, [loggedUser?.balance])

  const tariffActiveUntil = useMemo(() => {
    if (!loggedUser?.tariffActiveUntil) return null
    const date = new Date(loggedUser.tariffActiveUntil)
    if (Number.isNaN(date.getTime())) return null
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  }, [loggedUser?.tariffActiveUntil])

  const warningInfo = useMemo(() => {
    if (!loggedUser?.tariffActiveUntil || !selectedTariff) return null
    const price = Number(selectedTariff.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) return null
    const balance = Number(loggedUser?.balance ?? 0)
    const missingAmount = Math.max(
      price - (Number.isFinite(balance) ? balance : 0),
      0
    )
    if (!missingAmount) return null
    const endDate = new Date(loggedUser.tariffActiveUntil)
    if (Number.isNaN(endDate.getTime())) return null
    const diffMs = endDate.getTime() - nowTs
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    if (daysLeft > 5) return null
    return {
      daysLeft,
      missingAmount,
    }
  }, [loggedUser?.balance, loggedUser?.tariffActiveUntil, nowTs, selectedTariff])
  const fullName = getPersonFullName(loggedUser, { fallback: '-' })
  const [firstLine, ...restLines] = fullName.split(' ')
  const secondLine = restLines.join(' ')

  // const router = useRouter()

  const handleMouseOver = () => {
    if (turnOnHandleMouseOver) {
      setMenuOpen(false)
      setIsUserMenuOpened(true)
    }
  }

  const handleMouseOut = () => setIsUserMenuOpened(false)

  return (
    <div
      className="z-50 flex items-start justify-end h-16"
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
      onClick={() => {
        setTurnOnHandleMouseOver(false)
        setIsUserMenuOpened(!isUserMenuOpened)
        const timer = setTimeout(() => {
          setTurnOnHandleMouseOver(true)
          clearTimeout(timer)
        }, 500)
      }}
    >
      <div className="relative mt-2.5 flex w-12 flex-col items-end">
        <Avatar user={loggedUser} className="z-10" />
        {warningInfo && (
          <div className="absolute z-20 flex items-center justify-center w-5 h-5 bg-red-600 rounded-full shadow -top-1 -right-2">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="w-3 h-3 text-white"
            />
          </div>
        )}
        {/* {router && ( */}
        <motion.div
          className={cn(
            'absolute overflow-hidden rounded-tr-3xl border border-gray-800 duration-300'
            // isUserMenuOpened
            //   ? 'scale-100 h-auto translate-y-0 translate-x-0 w-auto'
            //   : 'w-0 h-0 scale-0 translate-x-[40%] -translate-y-1/2'
          )}
          variants={variants}
          animate={isUserMenuOpened ? 'show' : 'hide'}
          initial="hide"
          transition={{ duration: 0.2, type: 'tween' }}
        >
          <div className="flex flex-col justify-center px-3 py-1 font-bold leading-4 text-white border-b border-gray-800 cursor-default bg-general h-11 rounded-tr-3xl">
            <span>{firstLine}</span>
            <span>{secondLine}</span>
          </div>
          <div className="px-3 py-2 text-xs text-gray-700 truncate bg-white border-b border-gray-300">
            Тариф: {selectedTariffTitle}
            {tariffActiveUntil ? (
              <>
                {' '}
                (до{' '}
                <span
                  className={warningInfo ? 'font-semibold text-red-600' : ''}
                >
                  {tariffActiveUntil}
                </span>
                )
              </>
            ) : (
              ''
            )}
            <br />
            <div className="flex items-center gap-x-1">
              Баланс:{' '}
              <span className={warningInfo ? 'font-semibold text-red-600' : ''}>
                {formattedBalance} руб.
              </span>
              <Button
                name="Пополнить"
                superThin
                className="ml-2 h-6 rounded px-2 text-[10px]"
                onClick={() => modalsFunc.user?.topupInfo(loggedUser?._id)}
              />
            </div>
            {warningInfo && (
              <div className="mt-1 text-xs text-red-600 bg-white text-wrap">
                До окончания действия тарифа осталось{' '}
                {getNounDays(warningInfo.daysLeft)}. Необходимо пополнить баланс
                на {warningInfo.missingAmount.toLocaleString('ru-RU')} руб.
              </div>
            )}
          </div>

          {/* <MenuItem
              href="/cabinet/events"
              icon={faCalendarAlt}
              title="Мероприятия"
            /> */}
          <MenuItem
            href="/cabinet/tariff-select"
            icon={faTags}
            title="Смена тарифа"
          />
          <MenuItem
            href="/cabinet/profile"
            icon={faUserAlt}
            title="Профиль"
          />
          {/* {getParentDir(router.asPath) === 'cabinet' && (
              <MenuItem href="/" icon={faHome} title="Главная страница сайта" />
            )} */}
          {/* {getParentDir(router.asPath) === 'cabinet' ? (
              <MenuItem href="/" icon={faHome} title="Главная страница сайта" />
            ) : (
              <MenuItem href="/cabinet" icon={faListAlt} title="Мой кабинет" />
            )} */}
          <MenuItem
            onClick={signOut}
            icon={faSignOutAlt}
            title="Выйти из учетной записи"
          />
        </motion.div>
        {/* )} */}
      </div>
    </div>
  )
}

export default UserMenu
