'use client'

/* eslint-disable @next/next/no-img-element */
// import DevSwitch from '@components/DevSwitch'
import Link from 'next/link'
import UserMenu from './UserMenu'
import useUiDensity from '@helpers/useUiDensity'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { useAtomValue } from 'jotai'

const CabinetHeader = ({ title = '', titleLink, icon }) => {
  const { isCompact, toggleMode } = useUiDensity()
  const loggedUser = useAtomValue(loggedUserAtom)
  const isDev = loggedUser?.role === 'dev'

  return (
    <div
      className="relative z-20 flex h-16 w-full items-center justify-end gap-x-4 bg-black px-3 text-white"
      style={{ gridArea: 'header' }}
    >
      {title ? (
        <div className="flex flex-1 items-center">
          <Link href="/" shallow className="hidden tablet:block">
            <img
              className="h-14 rounded-full"
              src={icon || '/img/logo-48.png'}
              alt="logo"
            />
          </Link>
          <div className="tablet:border-l-1 flex min-h-[42px] flex-1 items-center leading-4 tablet:ml-3 tablet:border-gray-600 tablet:pl-3">
            {titleLink ? (
              <Link href={titleLink} shallow className="hover:text-gray-300">
                <h1>{title}</h1>
              </Link>
            ) : (
              <h1>{title}</h1>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute left-1/2 z-10 -translate-x-1/2">
          <Link href="/" shallow>
            <img className="h-12" src="/img/logo-48.png" alt="logo" />
          </Link>
        </div>
      )}

      {isDev ? (
        <button
          type="button"
          onClick={toggleMode}
          className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/60 hover:bg-white/10"
          title="Переключить плотность интерфейса"
        >
          {isCompact ? 'Обычно' : 'Плотно'}
        </button>
      ) : null}
      <UserMenu />
    </div>
  )
}

export default CabinetHeader

