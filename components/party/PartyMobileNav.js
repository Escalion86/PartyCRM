'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faBars } from '@fortawesome/free-solid-svg-icons'
import { isPartyMobileNavItemActive } from '@helpers/partyMobileNavigation'

export default function PartyMobileNav({
  pathname,
  items = [],
  menuOpen,
  onMenu,
  onCreate,
}) {
  return (
    <nav
      aria-label="Основная мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-sky-100 bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-lg md:hidden"
    >
      {items.map((item) =>
        item.create ? (
          <button
            key="create"
            type="button"
            aria-label={item.label}
            onClick={() => onCreate?.(item.href)}
            className="flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-semibold text-sky-700"
          >
            <FontAwesomeIcon
              icon={faPlus}
              className="h-4 w-4 rounded-full bg-sky-600 p-2 text-white"
            />
            Создать
          </button>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onMenu(false)}
            aria-current={isPartyMobileNavItemActive(pathname, item.href) ? 'page' : undefined}
            className={`flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[11px] leading-tight font-semibold ${isPartyMobileNavItemActive(pathname, item.href) ? 'bg-sky-50 text-sky-700' : 'text-slate-600'}`}
          >
            <FontAwesomeIcon icon={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        )
      )}
      <button
        type="button"
        aria-expanded={menuOpen}
        onClick={() => onMenu(!menuOpen)}
        className="flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-600"
      >
        <FontAwesomeIcon icon={faBars} className="h-5 w-5" />
        Ещё
      </button>
    </nav>
  )
}
